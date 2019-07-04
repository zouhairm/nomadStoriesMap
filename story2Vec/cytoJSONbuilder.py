#!/usr/bin/env python3

## This script builds up the necessary cytoscape json file

debug = True
ndebug = 500

withEdges = True

import yaml
import json

import string
import os
from tqdm import tqdm
import numpy as np

import gensim

import geocoder
geoNamesKey = '' #Needs to be given


global countryLocCache
countryLocCache = {}

NominatimCacheFile = './NominatimCache.yaml'
if os.path.isfile(NominatimCacheFile):
    with open(NominatimCacheFile) as f:
        countryLocCache = yaml.load(f)


countryLocCache['aliases'] = {
    'Palestine': 'Palestinian Territory',
    'Congo Democratic Rep': 'Congo Democratic Republic',
    'Bosnia & Herzegovina': 'Bosnia',
    'Usa': 'United States of America',
}
def geoLocate(countryName):
    global countryLocCache

    countryName = countryLocCache['aliases'].get(countryName,countryName)

    if not countryName in countryLocCache:
        try:
            #first pass
            res = geocoder.geonames(countryName, key=geoNamesKey)
            #second pass to get more details!
            res = geocoder.geonames(res.geojson['features'][0]['properties']['geonames_id'], method='details', key=geoNamesKey)
            props = res.geojson['features'][0]['properties']

            countryLocCache[countryName] = {'lonlat': [float(props['lng']), float(props['lat'])], 
                                            'cont': props['continent']}
        except Exception as E:
            print('Failed to get details for %s (error %s)'%(countryName, str(E)))
            countryLocCache[countryName] = {'lonlat': [0,0], 'cont': 'UN'}

    return countryLocCache[countryName] 

def storyToElement(fileid, filepath):
    with open(filepath) as f:
        s = yaml.load(f)


    element = {}

    setInCountryProps  = geoLocate(s['SetInCountry'])
    authorCountryProps = geoLocate(s['AuthorCountry'])
    element['position'] =  {
        'x':  setInCountryProps['lonlat'][0]*20, 
        'y': -setInCountryProps['lonlat'][1]*20
    }

    element['data'] = {
        'id': fileid,
        'label': s['Title'].title(),
        'parent': s['SetInCountry'],
        'AuthorName': s['AuthorName'],
        'AuthorCountry': s['AuthorCountry'],
        'AuthorCont': authorCountryProps['cont'],
        'SetInCountry': s['SetInCountry'],
        'Excerpt': ' '.join(s['Text'].split()[0:20]) + ' ...',
        'orgPos': element['position'],
    }

    # // NB the group field can be automatically inferred for you but specifying it
    # // gives you nice debug messages if you mis-init elements
    # element['group'] = 'nodes'


    return element

def extractNodes(dataFolder):
    nodes = []
    parents = []
    for f in tqdm(os.scandir(dataFolder)):
        if f.is_file():
            nodes.append(storyToElement(f.name, f.path))

            if 'parent' in nodes[-1]['data'] and not nodes[-1]['data']['parent'] in parents:
                parents += [nodes[-1]['data']['parent']]

        # #TODO: remove this eventually!
        if debug and len(nodes) > ndebug:
            break


    for p in parents:
        el = {'data': {'id': p, 'label': p}}
        nodes += [el]

    return nodes


def extractEdges(doc2VecModel, nodes, topn = 5):
    edges = []

    if not withEdges:
        return edges

    model = gensim.models.base_any2vec.BaseAny2VecModel.load(doc2VecModel)

    if debug:
        allNodeIds = [n['data']['id'] for n in nodes]

    for idx in tqdm(range(model.docvecs.count)):
        sourceTag = model.docvecs.index_to_doctag(idx)
        sourceId  = sourceTag.split('/')[-1]
        
        distances = model.docvecs.distances(sourceTag)

        topNIdx   = np.argpartition(distances, topn)[0:topn]
        worstIdx  = np.argmax(distances)

        newEdges = []
        mIdx, mDist = -1, np.Inf
        for jdx in list(topNIdx) + [worstIdx]:
            if jdx == idx: continue #skip self edges

            targetId = model.docvecs.index_to_doctag(jdx).split('/')[-1]


            edge = {'data': {'source': sourceId, 
                    'target': targetId,
                     'd': np.round(float(distances[jdx]),2)}}

            #skip if debugging and this edge doesn't have 
            #both source and target in all of the nodes
            if debug: 
                if not (sourceId in allNodeIds and targetId in allNodeIds):
                    continue

            newEdges.append(edge)

            if edge['data']['d'] < mDist:
                mIdx = len(newEdges) - 1
                mDist = edge['data']['d']
                

        if len(newEdges) == (topNIdx+1) > 0:
            newEdges[-1]['data']['leastSimilar'] = "1"

        if mIdx > -1:
            newEdges[mIdx]['data']['mostSimilar'] = "1"


        edges += newEdges

        if debug and len(edges) > 1000:
            break

    return edges
            
def buildCytoJSON(dataFolder, doc2VecModel, outFile = None):
    nodes = extractNodes(dataFolder)

    #TODO: actually compute the edges
    #probably makes sense to load them?
    edges = extractEdges(doc2VecModel, nodes)



    layout = {
        'name': 'concentric',
      }

    style = [
        {
          'selector': 'node',
          'style': {'label': 'data(id)'}
        }
      ]
    cytoDict = {
        # "format_version" : "1.0",
        # "generated_by" : "cytoscape-3.2.0",
        # "target_cytoscapejs_version" : "~2.1",

        #Default data ?
        "data" : {
            # "selected" : True,
            "__Annotations" : [ ],
            "shared_name" : "TravelStories",
            # "SUID" : 52,
            "name" : "TravelStories"
        },
        "elements": nodes + edges,
        "layout": layout,
        "style": style,
    }

    if outFile:
        try:
            with open(outFile, 'wt+') as f:
                json.dump(cytoDict, f, indent=2)
        except Exception as E:
            print('Failed to dump json file Error %s'%(str(E)))

    return cytoDict


if __name__ == '__main__':
    print('Running ... ')
    buildCytoJSON('dataFolder/2018', './gensimModel.m', 'cytoViz/2018Stories_cyto%s.json'%('_debug' if debug else ''))

    with open(NominatimCacheFile,'w+') as f:
        yaml.dump(countryLocCache, f)
