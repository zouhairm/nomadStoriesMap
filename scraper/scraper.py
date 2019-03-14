import mechanicalsoup as ms

import os
import numpy as np
import yaml


import logging
logging.basicConfig(format='%(levelname)s|  %(message)s',level=logging.INFO)
log = logging.getLogger('scraper')


from helperFuncs import *

#Get a browser instance:
browser = ms.StatefulBrowser()
browser.set_user_agent("IE/Chrome")

s  = GetAllStoryLinks(browser, year=2018)
s += GetAllStoryLinks(browser, year=2019)

# desiredTopics = [
# 'Focus and Bend',
# 'First Rides',
# 'Focus For Relaxation',
# 'Hooking ON',
# 'Groundwork',
# 'Other GW including Saddling',
# 'Basic Body Control']

# rootLinks = GetRootLinks(browser, desiredTopics)


# #scrape all the links/sublinks
# vimeoLinks = []
# for title, link in rootLinks.items():
#     navigateToHome(browser, login=False)
#     vimeoLinks += scrapePage(browser, title, link)


# linksAndPaths = buildPaths(vimeoLinks)



# with open('vimeoLinks3.yml', 'w') as outfile:
#     yaml.dump(linksAndPaths, outfile)