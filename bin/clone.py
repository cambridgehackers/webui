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
listfiles = True
gitdiff = False
update = True

def updateRepo(url, branch='master', update=True):
    name = os.path.basename(url)
    if os.path.exists(name):
        os.chdir(name)
        if update:
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
    if 'listfiles' in info:
        listfiles = info['listfiles']
    if 'gitdiff' in info:
        gitdiff = info['gitdiff']
    if 'noupdate' in info:
        update = not info['noupdate']
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
updateRepo(repo, branch, update)
if dirname:
    os.chdir(dirname)
if listfiles:
    for pattern in ['*',
                    boardname + '/Makefile',
                    boardname + '/*.mk',
                    boardname + '/verilog/*',
                    boardname + '/jni/*',
                    boardname + '/sources/*/*',
                    boardname + '/constraints/*',
                    boardname + '/obj/*',
                    boardname + '/bin/*',
                    boardname + '/Synth/*/*',
                    boardname + '/Impl/*/*']:
        for f in glob.glob(pattern):
            if os.path.isdir(f):
                print '<dir>' + f
            else:
                print '<file>' + f

if gitdiff:
    subprocess.call(['git', 'diff', 'HEAD'])

