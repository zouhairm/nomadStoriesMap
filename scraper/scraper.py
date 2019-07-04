import mechanicalsoup as ms

import os
import numpy as np
import yaml
import requests


import logging
logging.basicConfig(format='%(levelname)s|  %(message)s',level=logging.INFO)
log = logging.getLogger('scraper')


from helperFuncs import *

#Get a browser instance:
browser = ms.StatefulBrowser()
browser.set_user_agent("IE/Chrome")

#links = GetAllStoryLinks(browser, year=2018)
links = GetAllStoryLinks(browser, year=2019)[10440:]

#Temp hack to parallel process things!
#links = links[7500:]

session = requests.Session()
FetchAllStories(session, links)
