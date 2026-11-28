"""Run stage18_fauna via run_batch."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'asset-kit'))
os.environ['KIT_OUT_ROOT'] = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')), 'public/city-assets/kit')
os.environ['KIT_REPORT_DIR'] = '/tmp'

from run_batch import run
run('stage18_fauna', 0, None, 'fauna')
