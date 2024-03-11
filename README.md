# Test Server

Test server based on [WebRTC Medooze Media Server for Node.js
](https://github.com/medooze/media-server-node) with web apps allowing testing its features.

## Setup

Install project dependencies:

```bash
npm install
```

Add the Medooze media server for Node.js as a dependency in a version you would like to test (or link local one):

```bash
npm install medooze-media-server
```

Run the test server providing public IP address, by which the server can be reached from the machine running web apps:

```bash
node index 127.0.0.1
```

Web apps are available at port `8084`, e.g. https://127.0.0.1:8084.

## Usage

### Bandwidth estimation

App allows to connect browser as a viewer to a media server, after the stream is stopped it shows collected BWE stats.

#### Automated benchmark tests

There are pytest tests available to run benchmark suite, which tests media server's BWE algorithm in most common scenarios. The output of benchmark tests are bwe and webrtc-internals stats collected, while running scenarios.

To run tests, create python virtual env and install required dependencies by running the following commands in the root of the repo:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r test/requirements.txt
```

Now you can run tests by executing the following command in the root of the repo:

```bash
python -m pytest \
--tc_prefix="ssh root@192.168.0.103" \
--tc_interface="ens33" \
--twcc_app_url="https://192.168.0.103:8084/twcc" \
--stats_out="/tmp/stats"
```

Where:
 - `tc_prefix` is the prefix used for `tc` invocations, to run it on a remote machine, it can be ssh, as in the example, or docker, e.g. `docker container exec mediaserver-test-server-1`.
 - `tc_interface` is the interface name on a remote machine used by the media server, which will be managed by `tc` .
 - `twcc_app_url` is the url of twcc app exposed by test server.
 - `stats_out` is the path, where collected stats will be stored (relative or absolute).


Run

 ```bash
pytest --help
 ```

to check all available configuration options under `Custom options:` section.