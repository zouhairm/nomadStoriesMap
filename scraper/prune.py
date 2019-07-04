'''
This file moves stories that are less than a certain
threshold in wordcount to their own folder. This avoids
having to deal with "stub" submissions 
'''
import os
import numpy as np
import yaml
from tqdm import tqdm 



projDIR    = os.path.dirname(__file__)
dataFolder = os.path.join(projDIR, '../dataFolder/2019') #2018

wordCounts = {}
for file in tqdm(os.scandir(dataFolder)):
    if file.is_dir(): continue
    with open(file.path, 'r') as f:
        txt = yaml.load(f)['Text']
        wordCounts[file.name] = txt.count(' ')
        
        
# np.histogram(list(wordCounts.values()))

idxsort = np.argsort(list(wordCounts.values()))
items = list(wordCounts.items())
sortedTexts = [items[i] for i in idxsort]


for fname, c in tqdm(sortedTexts):
    if c < 200:
        destFolder = os.path.join(dataFolder, '0-100' if c <= 100 else '100-200')
        destFile   = os.path.join(destFolder, fname)
        
        srcFile   = os.path.join(dataFolder, fname)
        
#         print('Moving %s -> %s'%(srcFile, destFile))

        os.rename(srcFile, destFile)
        
        