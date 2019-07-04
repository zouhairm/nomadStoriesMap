import os
from tqdm import tqdm

from urllib.request import urlopen
from bs4 import BeautifulSoup
import requests

import yaml
from difflib import SequenceMatcher


projDIR    = os.path.dirname(__file__)
dataFolder = os.path.join(projDIR, '../dataFolder')


urlbase   = 'https://www.worldnomads.com'
appLinkFmt= '{base}/create/scholarships/writing/{year}/applications/{title}' 
pageRegEx = '/create/scholarships/writing/[0-9]+/applications/\?page='
storyRegEx= '/create/scholarships/writing/[0-9]+/applications/'

import logging
log = logging.getLogger('scraper')

def _navigateToRoot(browser, year, startpage):
    global urlbase

    title = '?page=%i'%startpage if startpage > 1 else ''
    #Navigate to root of year
    url = appLinkFmt.format(base=urlbase, year = year, title = title)
    r = browser.open(url)


def GetAllStoryLinks(browser, year, startpage=1, forceRestart=False):

    filename = os.path.join(dataFolder, 'storyLinks_%i.txt'%year)

    if not forceRestart and startpage == 1 and os.path.isfile(filename):
        log.info('Loading links from existing file %s'%filename)
        with open(filename, 'r') as inputFile:
            allStoryLinks = [line.rstrip() for line in inputFile]

        return allStoryLinks

    _navigateToRoot(browser, year, startpage)

    #Get navigation links
    pageLinks = browser.links(url_regex=pageRegEx)
    lastPageLink = pageLinks[-1]
    nPages = int(lastPageLink.attrs['href'].split('=')[-1])

    log.info('Getting story links for year=%i (total of %i pages)'%(year, nPages))

    allStoryLinks = []
    outFile = open(filename, 'w+' if forceRestart else 'a')

    for page in tqdm(range(startpage,nPages+1)):
        #Fetch links
        newLinks = _getPageStoryLinks(browser)
        allStoryLinks += newLinks

        #If for some reason nothing there, might be because browser messed up
        #try to recover!
        if len(newLinks) == 0:
            log.warning('Page %i is suspiciously empty ... manually skipping to %i'%(nextPage,nextPage+1))
            _navigateToRoot(browser, year, nextPage+1)
            continue

        #Dump links to a file
        for l in newLinks:
            outFile.write(l+'\n')
        outFile.flush()


        #If we reached the last page, we are done
        if page == nPages: break

        #Otherwise navigate to the next page
        try:
            pageLinks = browser.links(url_regex=pageRegEx)
            nextPageLink  = pageLinks[-2]
            nextPage = int(nextPageLink.attrs['href'].split('=')[-1])

            browser.follow_link(nextPageLink)
        except: #in case the above fails for some reason ... 
            log.error('Failed to parse next page link at %i'%page)
            break


    outFile.close()

    return allStoryLinks


def _getPageStoryLinks(browser):
    storyLinks = [urlbase + l.attrs['href'] 
                    for l in browser.links(url_regex=storyRegEx) 
                        if 'ContentCard' in l.attrs.get('class','')
                 ]

    return storyLinks

# ##########

def _getStory(browser, link):
    if type(browser) == requests.sessions.Session:
        response = browser.get(link)
        soup = BeautifulSoup(response.content, 'lxml')
    else:
        browser.open(link)
        soup = browser.get_current_page()


    meta = yaml.load(soup.find(attrs={'type':'application/ld+json'}).text)

    story = {'Title': meta['name'], 
            'DateModified': meta['dateModified'], 
            'DatePublished': meta['datePublished'],
             'Url': link}

    country_category = soup.find(attrs={'class':'scholarships-entry-country'})
    ch = list(country_category.children)

    story['SetInCountry']  = ch[-1].title().strip()
    story['Category'] = ch[1].text.strip()

    author_and_country = soup.find(attrs={'class':'standfirst'})
    author_name, author_country = author_and_country.text.strip().split('\n')

    story['AuthorName'] = author_name.strip()[3:]
    story['AuthorCountry'] = author_country.strip('\r\n() ')

    story['Text'] = soup.find(attrs={'class':'col-sm-12 col-lg-8'}).text.strip()

    return story




#Using a custom Dumper class to prevent changing the global state
# Super neat hack to preserve the mapping key order. 
# See https://stackoverflow.com/a/52621703/1497385 & https://stackoverflow.com/questions/16782112/
class MyYamlDictDumper(yaml.Dumper):
    def represent_dict_preserve_order(self, data):
        return self.represent_dict(data.items())    
MyYamlDictDumper.add_representer(dict, MyYamlDictDumper.represent_dict_preserve_order)


def FetchAllStories(browser, links, overwrite = False):

    prevName = ''
    for l in tqdm(links):
        urlsplit = l.split('/')
        storyName = l.split('/')[-1]
        year = urlsplit[-3]

        if SequenceMatcher(None, storyName, prevName).ratio() > 0.9:
            log.warning('Skipping %s/%s (likely duplicate of %s)'%(year,storyName, prevName))
            continue

        prevName = storyName

        dirname   = os.path.join(dataFolder, year)
        storyFile = os.path.join(dirname, storyName)

        #Check if we already fetched this story
        if overwrite == False and os.path.isfile(storyFile):
            continue
        elif not os.path.isdir(dirname):
            os.makedirs(os.path.dirname(storyFile), exist_ok=True)

        #fetch the actual story
        try:
            story = _getStory(browser, l)
        except:
            log.error('Failed to fetch %s'%storyName)
            continue

        try:
            with open(storyFile,'w') as f:
                yaml.dump(story, f, Dumper = MyYamlDictDumper, default_flow_style=False)
        except Exception as e:
            log.error('Failed to save file for %s'%l + str(e))
            continue

