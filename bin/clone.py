#!/usr/bin/python

import os
import sys
import subprocess
import json
import glob

repo = None
dirname = None
username = 'defaultuser'
boardname = 'zedboard'
branch = 'master'

def updateRepo(url, branch='master'):
    name = os.path.basename(url)
    if os.path.exists(name):
        os.chdir(name)
        subprocess.call(['git', 'pull', 'origin', branch])
    else:
        subprocess.call(['git', 'clone', url, '-b', branch])
        os.chdir(name)

if sys.argv[1].startswith('{'):
    info = json.loads(sys.argv[1])
    repo = info['repo']
    if 'dir' in info:
        dirname = info['dir']
    if 'boardname' in info:
        boardname = info['boardname']
    if 'branch' in info:
        branch = info['branch']
    if 'username' in info:
        username = info['username']
else:
    repo = sys.argv[1]
    if len(sys.argv) > 2:
        dirname = sys.argv[2]

if not os.path.isdir(username):
    os.mkdir(username)
os.chdir(username)

if not '/' in repo:
    print 'defaulting repo prefix', repo
    repo = 'git://github.com/cambridgehackers/' + repo
if not repo.startswith('git://github.com'):
    repo = 'git://github.com/' + repo
updateRepo(repo)
if dirname:
    os.chdir(dirname)
for pattern in ['*',
                boardname + '/verilog/*',
                boardname + '/jni/*',
                boardname + '/sources/*/*',
                boardname + '/bin/*',
                boardname + '/Synth/*',
                boardname + '/Impl/*/*']:
    for f in glob.glob(pattern):
        if os.path.isdir(f):
            print '<dir>' + f
        else:
            print '<file>' + f
