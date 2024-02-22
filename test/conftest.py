import pathlib


def pytest_addoption(parser):
    parser.addoption("--tc_prefix", action="store",
                     help="prefix added to all tc invocation, to run in on remote target, e.g. docker container exec mediaserver-test-server-1, ssh -p 2222 root@127.0.0.1", required=True)
    parser.addoption("--tc_interface", action="store",
                     help="interface used in all tc invocations, e.g. eth0", required=True)
    parser.addoption("--stats_out", action="store",
                     help="path to store collected stats", required=True, type=pathlib.Path)
    parser.addoption("--twcc_app_url", action="store",
                     help="https address of twcc app", required=True)
    parser.addoption("--step_length", action="store",
                     help="benchmark step length [s]", default=60, type=int)
    parser.addoption("--parent_qdisc_delay", action="store",
                     help="parent netem qdisc delay [ms]", default=20, type=int)
    parser.addoption("--child_qdisc_rate", action="store",
                     help="initial child netem qdisc rate [kbps]", default=4000, type=int)
    parser.addoption("--child_qdisc_delay", action="store",
                     help="initial child netem delay [ms]", default=20, type=int)
