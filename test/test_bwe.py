import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
import time
import subprocess
import requests


@pytest.fixture(scope="session")
def session_timestamp():
    return time.time_ns()


@pytest.fixture(scope="session")
def step_length_s(pytestconfig):
    return pytestconfig.getoption("step_length")


@pytest.fixture
def driver(pytestconfig, request, session_timestamp):
    prefs = {}
    prefs["profile.default_content_settings.popups"] = 0
    download_destination = pytestconfig.getoption(
        'stats_out') / str(session_timestamp) / request.node.name
    download_destination.mkdir(parents=True)
    prefs["download.default_directory"] = str(download_destination.absolute())

    options = webdriver.ChromeOptions()
    # options.add_argument('headless')
    options.add_experimental_option("prefs", prefs)
    # allows webrtc-internals stats to be collected in the background
    options.add_argument("disable-background-timer-throttling")
    options.add_argument("ignore-certificate-errors")
    driver = webdriver.Chrome(options=options)
    yield driver

    driver.close()
    driver.quit()


class WebrtcStatsCollector:
    _driver = None
    _window_handle = None

    def __init__(self, driver) -> None:
        self._driver = driver

    def start(self):
        current_window_handle = self._driver.current_window_handle
        self._driver.switch_to.new_window()
        self._driver.get("chrome://webrtc-internals")
        self._window_handle = self._driver.current_window_handle

        self._driver.switch_to.window(current_window_handle)

    def download_stats(self):
        self._driver.switch_to.window(self._window_handle)
        self._driver.find_element(
            By.XPATH, '//summary[text()="Create a WebRTC-Internals dump"]').click()
        self._driver.find_element(
            By.XPATH, '//button[starts-with(text(), "Download")]').click()
        time.sleep(5)  # TODO: wait for download to finish


@pytest.fixture
def webrtc_stats_collector(driver):
    webrtc_stats_collector = WebrtcStatsCollector(driver)
    webrtc_stats_collector.start()
    yield driver
    webrtc_stats_collector.download_stats()


class TwccPageControler:
    _url = ""
    _driver = None
    _window_handle = None

    def __init__(self, url, driver) -> None:
        self._url = url
        self._driver = driver

        self._driver.switch_to.new_window()
        self._driver.get(self._url)
        self._window_handle = driver.window_handles[-1]

    def start(self):
        self._driver.switch_to.window(self._window_handle)
        element = WebDriverWait(self._driver, 10).until(
            EC.presence_of_element_located((By.ID, "start")))
        button = self._driver.find_element(By.ID, "start")
        ActionChains(self._driver).move_to_element(
            button).move_by_offset(-20, 0).click().perform()

    def stop(self):
        self._driver.switch_to.window(self._window_handle)
        button = self._driver.find_element(By.ID, "close")
        ActionChains(self._driver).move_to_element(
            button).move_by_offset(-20, 0).click().perform()

    def download_bwe_stats(self):
        self._driver.switch_to.window(self._window_handle)
        button = WebDriverWait(self._driver, 10).until(
            EC.presence_of_element_located((By.XPATH, '//a[text()="Download CSV"]')))
        self._driver.execute_script("arguments[0].click();", button)
        time.sleep(5)  # TODO: wait for download to finish


@pytest.fixture
def viewer(webrtc_stats_collector, pytestconfig):
    test_page = TwccPageControler(
        pytestconfig.getoption("twcc_app_url"), webrtc_stats_collector)
    yield test_page
    test_page.download_bwe_stats()


class NetworkControler:
    """
    Uses tc for network shaping on remote machine running test server.
    Replaces default root qdisc on a given interface with netem and adds
    another netem qdisc after it.

    After object construction, the traffic will go through the following
    hierarchy:

    root 1: netem delay 20ms
          |
         2: netem rate 4000kbit delay 20ms

    When calling apply(), 2: netem is replaced with another netem. tc replace
    is used instead of add/del, because the later can destroy network buffers
    and causes packet drops.
    """
    _remote_target = ""
    _interface = ""
    _child_qdisc_rate = 0
    _child_qdisc_delay = 0
    _rate = 0
    _delay = 0

    def __init__(self, remote_target, interface, parent_qdisc_delay, rate, delay) -> None:
        self._remote_target = remote_target
        self._interface = interface
        self._child_qdisc_rate = rate
        self._child_qdisc_delay = delay
        self._rate = rate
        self._delay = delay

        self.clean_up()
        self.run_command(
            f"tc qdisc add dev {self._interface} root handle 1: netem delay {parent_qdisc_delay}ms")
        self.apply()

    def run_command(self, command, stderr=None):
        cmd = self._remote_target + " " + command
        subprocess.check_output(cmd.split(), stderr=stderr)

    def set_rate(self, rate):
        self._rate = rate
        return self

    def set_delay(self, delay):
        self._delay = delay
        return self

    def apply(self):
        self.run_command(
            f"tc qdisc replace dev {self._interface} parent 1: handle 2: netem rate {self._rate}kbit delay {self._delay}ms")

    def reset(self):
        self.run_command(
            f"tc qdisc replace dev {self._interface} parent 1: handle 2: netem rate {self._child_qdisc_rate}kbit delay {self._child_qdisc_delay}ms")

    def clean_up(self):
        try:
            self.run_command(
                f"tc qdisc del dev {self._interface} root handle 1", stderr=subprocess.DEVNULL)
        except subprocess.CalledProcessError:
            pass


@pytest.fixture
def network_controler(pytestconfig):
    network_controler = NetworkControler(pytestconfig.getoption("tc_prefix"), pytestconfig.getoption(
        "tc_interface"), pytestconfig.getoption("parent_qdisc_delay"), pytestconfig.getoption("child_qdisc_rate"), pytestconfig.getoption("child_qdisc_delay"))
    yield network_controler
    network_controler.clean_up()


def run_tcp_connections(target_url, duration, connection_duration):
    t_end = time.time() + duration
    while (start := time.time()) < t_end:
        r = requests.get(target_url, allow_redirects=True,
                         verify=False, stream=True)

        for chunk in r.iter_content(1024):
            if time.time() > start + min(connection_duration, t_end - start):
                break


def test_1mbps_limit_off_on_off(step_length_s, viewer, network_controler):
    network_controler.set_rate(4000).set_delay(20).apply()
    viewer.start()
    time.sleep(step_length_s)

    network_controler.set_rate(1000).apply()
    time.sleep(step_length_s)

    network_controler.set_rate(4000).apply()
    time.sleep(step_length_s)

    viewer.stop()


def test_1mbps_limit_on_off(step_length_s, viewer, network_controler):
    network_controler.set_rate(1000).set_delay(20).apply()
    viewer.start()
    time.sleep(step_length_s)

    network_controler.set_rate(4000).apply()
    time.sleep(step_length_s)

    viewer.stop()


def test_1mbps_limit_high_rtt_off_on_off(step_length_s, viewer, network_controler):
    network_controler.set_rate(4000).set_delay(200).apply()
    viewer.start()
    time.sleep(step_length_s)

    network_controler.set_rate(1000).apply()
    time.sleep(step_length_s)

    network_controler.set_rate(4000).apply()
    time.sleep(step_length_s)

    viewer.stop()


def test_1mbps_limit_high_rtt_off_on_off(step_length_s, viewer, network_controler):
    network_controler.set_rate(1000).set_delay(200).apply()
    viewer.start()
    time.sleep(step_length_s)

    network_controler.set_rate(4000).apply()
    time.sleep(step_length_s)

    viewer.stop()


def test_2nd_viewer_joins_in_network_limited_to_1mbps_off_on_off(step_length_s, viewer, network_controler, driver, pytestconfig):
    network_controler.set_rate(1000).set_delay(20).apply()
    second_viewer = TwccPageControler(
        pytestconfig.getoption("twcc_app_url"), driver)
    viewer.start()
    time.sleep(step_length_s)

    second_viewer.start()
    time.sleep(step_length_s)

    second_viewer.stop()
    second_viewer.download_bwe_stats()
    time.sleep(step_length_s)

    viewer.stop()


def test_2nd_viewer_joins_in_network_limited_to_1mbps_on_off(step_length_s, viewer, network_controler, driver, pytestconfig):
    network_controler.set_rate(1000).set_delay(20).apply()
    second_viewer = TwccPageControler(
        pytestconfig.getoption("twcc_app_url"), driver)
    viewer.start()
    second_viewer.start()
    time.sleep(step_length_s)

    second_viewer.stop()
    second_viewer.download_bwe_stats()
    time.sleep(step_length_s)

    viewer.stop()


def test_2nd_viewer_joins_in_network_limited_to_3mbps_off_on_off(step_length_s, viewer, network_controler, driver, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    second_viewer = TwccPageControler(
        pytestconfig.getoption("twcc_app_url"), driver)
    viewer.start()
    time.sleep(step_length_s)

    second_viewer.start()
    time.sleep(step_length_s)

    second_viewer.stop()
    second_viewer.download_bwe_stats()
    time.sleep(step_length_s)

    viewer.stop()


def test_2nd_viewer_joins_in_network_limited_to_3mbps_on_off(step_length_s, viewer, network_controler, driver, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    second_viewer = TwccPageControler(
        pytestconfig.getoption("twcc_app_url"), driver)
    viewer.start()
    second_viewer.start()
    time.sleep(step_length_s)

    second_viewer.stop()
    second_viewer.download_bwe_stats()
    time.sleep(step_length_s)

    viewer.stop()


def test_concurent_tcp_connection_10s_off_on_off(step_length_s, viewer, network_controler, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    viewer.start()
    time.sleep(step_length_s)
    run_tcp_connections(pytestconfig.getoption(
        "twcc_app_url") + "/big_file_for_tests_10MB", step_length_s, 10)
    time.sleep(step_length_s)
    viewer.stop()


def test_concurent_tcp_connection_10s_on_off(step_length_s, viewer, network_controler, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    viewer.start()
    run_tcp_connections(pytestconfig.getoption(
        "twcc_app_url") + "/big_file_for_tests_10MB", step_length_s, 10)
    time.sleep(step_length_s)
    viewer.stop()


def test_concurent_tcp_connection_1s_off_on_off(step_length_s, viewer, network_controler, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    viewer.start()
    time.sleep(step_length_s)
    run_tcp_connections(pytestconfig.getoption(
        "twcc_app_url") + "/big_file_for_tests_10MB", step_length_s, 1)
    time.sleep(step_length_s)
    viewer.stop()


def test_concurent_tcp_connection_1s_on_off(step_length_s, viewer, network_controler, pytestconfig):
    network_controler.set_rate(3000).set_delay(20).apply()
    viewer.start()
    run_tcp_connections(pytestconfig.getoption(
        "twcc_app_url") + "/big_file_for_tests_10MB", step_length_s, 1)
    time.sleep(step_length_s)
    viewer.stop()
