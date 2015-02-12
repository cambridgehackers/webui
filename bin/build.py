#!/usr/bin/python

import os
import sys
import subprocess
import json
import glob

verbose = False
listfiles = False

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
    if verbose:
        print info
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
else:
    repo = sys.argv[1]
    if len(sys.argv) > 2:
        dirname = sys.argv[2]

if not os.path.isdir(username):
    os.mkdir(username)
os.chdir(username)

if verbose:
    print 'repo', repo
if not '/' in repo:
    if verbose:
        print 'defaulting repo prefix', repo
    repo = 'git://github.com/cambridgehackers/' + repo
if not repo.startswith('git://github.com'):
    repo = 'git://github.com' + repo
updateRepo(repo)
if verbose:
    print 'dirname', dirname
if dirname:
    os.chdir(dirname)
if verbose:
    print os.curdir
os.environ['LM_LICENSE_FILE'] = '27000@10.0.0.61'
os.environ['CONNECTALDIR'] = '/usr/share/connectal'
os.environ['PATH'] = (os.environ['PATH']
                      + ':/scratch/Xilinx/Vivado/2014.1/bin'
                      + ':/scratch/android-ndk-r9d'
                      + ':/scratch/bluespec/Bluespec-2014.07.A/bin')
os.environ['BLUESPECDIR'] = '/scratch/bluespec/Bluespec-2014.07.A/lib'

exitcode = subprocess.call(['make', 'V=1', 'build.%s' % boardname])

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

sys.exit(exitcode)
