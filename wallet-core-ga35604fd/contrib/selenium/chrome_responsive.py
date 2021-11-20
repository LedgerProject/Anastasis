#!/usr/bin/env python3

"""
Stub used to just test how selenium triggers chrome
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.common.action_chains import ActionChains
from urllib import parse
import argparse
import time
import logging
import sys
import os
import re
import json

logging.basicConfig(format='%(levelname)s: %(message)s', level=logging.INFO)
logger = logging.getLogger(__name__)

def client_setup(args):
    """Return a dict containing the driver and the extension's id"""
    co = webdriver.ChromeOptions()
    cap = co.to_capabilities()
    cap['loggingPrefs'] = {'driver': 'INFO', 'browser': 'INFO'}

    if args.remote:
        client = webdriver.Remote(desired_capabilities=cap, command_executor=args.remote)
    else:
        client = webdriver.Chrome(desired_capabilities=cap)
    client.get('https://gnunet.org/')
    html = client.find_element(By.TAG_NAME, "html")
    return client

parser = argparse.ArgumentParser()
parser.add_argument('--remote', help="Points webdriver.Remote at URI", metavar="URI", type=str, dest="remote")
args = parser.parse_args()
ret = client_setup(args)
logger.info("Chromium is responsive")
for entry in ret.get_log("browser"):
    print(entry.get("message"))
time.sleep(3)
ret.close()
