import flask
from flask import Flask, request
import subprocess
import json
import sys
import os

if sys.version_info.major < 3:
    print("Python>=3 required")
    os.exit(1)

app = Flask(__name__)


@app.route("/")
def hello_world():
    return "<p>Hello, World!</p>"


@app.route("/start-recovery")
def start_recovery():
    res = subprocess.run(["anastasis-reducer", "-r"], capture_output=True)
    resp = flask.Response(res.stdout)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route("/start-backup")
def start_backup():
    res = subprocess.run(["anastasis-reducer", "-b"], capture_output=True)
    resp = flask.Response(res.stdout)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


@app.route("/action", methods=["POST", "OPTIONS"])
def reduce_action():
    if request.method == "OPTIONS":
        resp = flask.Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = '*'
        resp.headers['Access-Control-Allow-Method'] = '*'
        return resp

    b = request.get_json()
    res = subprocess.run(
        ["anastasis-reducer", "-a", json.dumps(b["arguments"]), b["action"]],
        capture_output=True,
        input=json.dumps(b["state"]).encode("utf-8"),
    )
    resp = flask.Response(res.stdout)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp
