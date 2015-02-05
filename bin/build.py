#!/usr/bin/python

import os
import sys
import subprocess


def updateRepo(url):
    name = os.path.basename(url)
    if os.path.exists(name):
        os.chdir(name)
        subprocess.call(['git', 'pull', 'origin', 'master'])
    else:
        subprocess.call(['git', 'clone', url])
        os.chdir(name)


repo = sys.argv[1]
if not '/' in repo:
    repo = 'git://github.com/cambridgehackers/' + repo
if not repo.startswith('git://github.com'):
    repo = 'git://github.com' + repo
updateRepo(repo)
if len(sys.argv) > 2:
    os.chdir(sys.argv[2])
os.environ['LM_LICENSE_PATH'] = '27000@localhost'
os.environ['CONNECTALDIR'] = '/usr/share/connectal'
os.environ['PATH'] = os.environ['PATH'] + ':/scratch/Xilinx/Vivado/2014.1/bin'
subprocess.call(['make', 'build.zedboard'])

