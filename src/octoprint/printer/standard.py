# coding=utf-8
"""
This module holds the standard implementation of the :class:`PrinterInterface` and it helpers.
Modify by maxchen <maxchen@ms2.hinet.net> 2015
"""

from __future__ import absolute_import
#from docutils.parsers.rst.directives import path
# from docutils.parsers import null
# from __builtin__ import None

__author__ = "Gina Häußge <osd@foosel.net>"
__license__ = 'GNU Affero General Public License http://www.gnu.org/licenses/agpl.html'
__copyright__ = "Copyright (C) 2014 The OctoPrint Project - Released under terms of the AGPLv3 License"
from serial import		SerialException
import serial
import copy
import logging
import os
import shutil
import threading
import time
import zipfile
import tempfile
import imghdr
import ftplib
import socket
# from PIL import Image
# from PIL.Image import core as _imaging
# import wx
#import cv2
import numpy as np
from PIL import Image
from octoprint import util as util
from octoprint.events import eventManager, Events
from octoprint.filemanager import FileDestinations
from octoprint.plugin import plugin_manager, ProgressPlugin
from octoprint.printer import PrinterInterface, PrinterCallback, UnknownScript
from octoprint.printer.estimation import TimeEstimationHelper
from octoprint.settings import settings
from octoprint.util import comm as comm
from datetime import datetime
import pygame
from pygame.locals import *
import re
class PrintimgThread (threading.Thread):
  blayer = 0
  dpi = 0
  layers = []
  thickness = 0.0
  size = []
  data = []
  maxRetries = 20
  showgrid = 0
  running = False
  offx = 0.0
  offy = 0.0
  index = 0
  estimated_time = None
  total_time = None
  port1 = None
  pro = None
  maskimg = None
  def __init__(self, thread_id, name, thread_lock, sendCommand, setjobCommand, sendlogCommand, finish_print):
    threading.Thread.__init__(self)
    self.thread_id = thread_id
    [self.fromlayerIdx, self.tolayerIdx, self.exposureIdx, self.liftIdx, self.upspeedIdx, self.downspeedIdx, self.delayIdx] = (x for x in range(7))
    self.name = name
    self.sendCommand = sendCommand
    self.setjobCommand = setjobCommand
    self.sendlogCommand = sendlogCommand
    self.finish_print = finish_print
    self.thread_lock = thread_lock
    self.eshutter = False
    self.emask = False
    self.pauseflag = 0
    if os.path.isfile('/home/pi/pcflag.txt'):
      self.piflag = 0
    else:
      self.piflag = 1
    # self.sendlogCommand("Starting " + self.name)
    window_name = self.name
    #cv2.namedWindow(window_name, cv2.WND_PROP_FULLSCREEN)
    #cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.cv.CV_WINDOW_FULLSCREEN)
    self.black = (0,0,0)
    self.blankimg = pygame.image.load('/home/pi/Blank_1440x2560.png')
    self.gridimg = pygame.image.load('/home/pi/White_1440x2560.png')
    #self.toggle_fullscreen()
    if self.piflag == 1:
      SW,SH = 1440,2560
      self.screen = pygame.display.set_mode((SW,SH))
      screen = pygame.display.get_surface()
      tmp = screen.convert()
      caption = pygame.display.get_caption()
      cursor = pygame.mouse.get_cursor()	# Duoas 16-04-2007

      w,h = screen.get_width(),screen.get_height()
      flags = screen.get_flags()
      bits = screen.get_bitsize()

      pygame.display.quit()
      pygame.display.init()

      screen = pygame.display.set_mode((w,h),flags^FULLSCREEN,bits)
      screen.blit(tmp,(0,0))
      pygame.display.set_caption(*caption)

      pygame.key.set_mods(0) #HACK: work-a-round for a SDL bug??

      pygame.mouse.set_cursor( *cursor )	# Duoas 16-04-2007
      #self.screen.fill(self.black)
      pygame.mouse.set_visible(False)
      screen = pygame.display.get_surface()
      screen.blit(self.blankimg,(0,0))
      pygame.display.update()
    else:
      SW,SH = 1440,2560
      screen = pygame.display.set_mode((SW,SH))
      screen = pygame.display.get_surface()
      screen.blit(self.blankimg,(0,0))
      pygame.display.update()

    #cv2.imshow(window_name, self.blankimg)
    #key = cv2.waitKey(5)

  def run(self):
    window_name = self.name
    shimg = None
    while True:
      # self.thread_lock.acquire()		# These didn't seem necessary
      if self.showgrid == 1 :
        self.sendCommand("M280 P0 S90")
        #shimg = self.blankimg
        screen = pygame.display.get_surface()
        screen.blit(self.blankimg,(0,0))
        pygame.display.update()
      if self.showgrid == 2 :
        self.sendCommand("M280 P0 S30")
        #shimg = self.gridimg
        screen = pygame.display.get_surface()
        screen.blit(self.gridimg,(0,0))
        pygame.display.update()
      if self.showgrid == 2 or self.showgrid == 1:
        self.showgrid = 0
        #cv2.imshow(window_name, shimg)
      time.sleep(0.05)
      #key = cv2.waitKey(5)
      if self.running :
        self.next_img()
    #cv2.destroyWindow(window_name)
    self.sendlogCommand(self.name + " Exiting")
  def next_img(self):
    window_name = self.name
    if not self.running:
      self.pauseflag = 1
      return
    if self.index < len(self.layers):
      self.pauseflag = 0
      # self.sendlogCommand("In next_img, self.index %d" %(self.index)
      if self.eshutter == True:
        self.sendCommand("M280 P0 S30")
        self.sendCommand("M106")
        time.sleep(0.1)
      self.set_estimated_time()
      self.setjobCommand(self.index + 1, self.estimated_time, self.pauseflag)
      self.sendlogCommand("Layer %d" % (self.index + 1))
      #self.sendlogCommand(str(datetime.now()))
      if self.offx == 0.0 and self.offy == 0.0:
        if self.emask == True:
          background = Image.open(self.layers[self.index]).convert("L")
          background.paste(self.maskimg, (0, 0),background)
          size = background.size
          raw_str = background.convert("RGBA").tobytes("raw", "RGBA")
          pygame_surface = pygame.image.fromstring(raw_str, size,'RGBA')
          screen = pygame.display.get_surface()
          screen.blit(pygame_surface,(0,0))
          pygame.display.update()
          #img = np.asarray(background)
          #cv2.imshow(window_name, img)
          #img = cv2.cvtColor(np.array(background.convert("L")), cv2.COLOR_RGB2GRAY)
        else:
          img = pygame.image.load(self.layers[self.index])
          screen = pygame.display.get_surface()
          screen.blit(img,(0,0))
          pygame.display.update()
          #cv2.imshow(window_name, img)
      else:
        if self.emask == True:
          background = Image.open(self.layers[self.index]).convert("L")
          background.paste(self.maskimg, (0, 0),background)
          img = np.asarray(background)
          cv2.imshow(window_name, img)
          #img = cv2.cvtColor(np.array(background.convert("L")), cv2.COLOR_RGB2GRAY)
        else:
          img = cv2.imread(self.layers[self.index])
          rows, cols, depth = img.shape
          M = np.float32([[1, 0, self.offx], [0, 1, self.offy]])
          dst = cv2.warpAffine(img, M, (cols, rows))
          cv2.imshow(window_name, dst)


      if self.spectype == "LayerGroup":
        nCL = self.index + 1	# current layer

        for i in range(len(self.data)):
          if (nCL - self.data[i][self.fromlayerIdx]) * (self.data[i][self.tolayerIdx] - nCL) >= 0:
            break
        self.exposure = self.data[i][self.exposureIdx]
        self.delay = self.data[i][self.delayIdx]
        self.lift = self.data[i][self.liftIdx]
        self.upspeed = self.data[i][self.upspeedIdx]
        self.downspeed = self.data[i][self.downspeedIdx]
        # self.sendlogCommand("in next_img, nCL: %d, lift: %d, downspeed: %d" %(nCL, self.lift, self.downspeed)
      else:
        self.exposure = self.data[self.index][self.exposureIdx - 2]
        self.delay = self.data[self.index][self.delayIdx - 2]
        self.lift = self.data[self.index][self.liftIdx - 2]
        self.upspeed = self.data[self.index][self.upspeedIdx - 2]
        self.downspeed = self.data[self.index][self.downspeedIdx - 2]
      #key = cv2.waitKey(1) & 0xFF
      #if self.exposure > 0.6:
      #	time.sleep(self.exposure - 0.6)

      #key = cv2.waitKey(int(1000 * self.exposure)) & 0xFF
      #key = cv2.waitKey(etime) & 0xFF
      #self.sendlogCommand(str(datetime.now()))
      time.sleep(self.exposure)
      screen = pygame.display.get_surface()
      screen.blit(self.blankimg,(0,0))
      pygame.display.update()
      #cv2.imshow(window_name, self.blankimg)
      #key = cv2.waitKey(1) & 0xFF
      #key = cv2.waitKey(5)
      #self.sendlogCommand(str(datetime.now()))
      self.sendlogCommand("Lift " + str(self.lift))
      if self.eshutter == True:
        time.sleep(0.2)
        self.sendCommand("M280 P0 S90")
        self.sendCommand("M107")

      if self.sendCommand != None :
        self.sendCommand("G91")


        self.sendCommand("G1 Z%f F%g" % (self.lift, self.upspeed,))

        # print("G1 Z-%f F%g" % (self.lift,self.upspeed,))

        # self.printer.send_now("G1 Z-%f F%g" % (self.lift-self.thickness,self.z_axis_rate,))
        self.sendCommand("G1 Z-%f F%g" % (self.lift - self.thickness, self.downspeed,))

        # print("G1 Z-%f F%g" % (self.lift-self.thickness,self.downspeed,))

        self.sendCommand("G90")
        self.sendCommand("M114")
      else:
        time.sleep(self.delay)
      self.pauseflag = 1
      delay = (self.lift / self.upspeed + (self.lift - self.thickness) / self.downspeed) * 60 + self.delay
      #if self.eshutter == True and delay > 0.5:
#delay = delay - 0.5
      #if self.eshutter == True and delay > 0.4:
      #	delay = delay - 0.4
      #if delay > 0.2:
      #	delay = delay - 0.2
      #	time.sleep(0.2)
      self.setjobCommand(self.index + 1, self.estimated_time, self.pauseflag)
      time.sleep(delay)
      # self.sendlogCommand("delay: %s" % str(datetime.now()))

      self.index += 1
    else:
      self.sendCommand("M106 S0")
      zb = 15.0 #lift height when finish the print
      fb = 15.0 #slowly lift up
      db = 0.0
      db = (zb / fb) * 60 
      self.sendCommand("G91")
      self.sendCommand("G1 Z%f F%f" % (zb, fb,))
      self.sendCommand("G90")
      self.sendCommand("M114")
      time.sleep(db)
      self.sendCommand("M280 P0 S90")
      self.sendlogCommand("G1 Z 20")
      self.sendCommand("G91")
      self.sendCommand("G1 Z165 F200")
      self.sendCommand("G90")
      self.sendCommand("M114")
      self.finish_print()
      self.running = False
      self.sendlogCommand("Fan off")
      self.sendCommand("M42 P10 S0")
  def set_estimated_time(self):
    # if not hasattr(self, 'layers'):
    # 		 self.sendlogCommand("No model loaded!"
    # 		 return

    current_layer = self.index + 1
    thickness = self.thickness
    # remaining_layers = len(self.layers[0]) - current_layer

    if self.spectype == "LayerGroup":
      estimated_time = 0.0

      for i in range(len(self.data)):
        layers_in_group = self.data[i][self.tolayerIdx] - self.data[i][self.fromlayerIdx] + 1
        remaining_layers = min(self.data[i][self.tolayerIdx] - current_layer, layers_in_group)
        #if remaining_layers > 0:
        exposure = self.data[i][self.exposureIdx]
        delay = self.data[i][self.delayIdx]
        lift = self.data[i][self.liftIdx]
        upspeed = self.data[i][self.upspeedIdx]
        downspeed = self.data[i][self.downspeedIdx]
        time_per_layer = exposure + (lift / upspeed + (lift - thickness) / downspeed) * 60 + delay +1.30
        if remaining_layers > 0:
            estimated_time += remaining_layers * time_per_layer
        else:
            estimated_time = time_per_layer
    self.estimated_time = time.strftime("%H:%M:%S", time.gmtime(estimated_time))
'''
      #print "in next_img, nCL: %d, lift: %d, downspeed: %d" %(nCL, self.lift, self.downspeed)
    else:
      self.exposure = self.data[self.index][self.exposureIdx-2]
      self.delay = self.data[self.index][self.delayIdx-2]
      self.lift = self.data[self.index][self.liftIdx-2]
      self.upspeed = self.data[self.index][self.upspeedIdx-2]
      self.downspeed = self.data[self.index][self.downspeedIdx-2]
    if (self.bylgroup_rb.GetValue()): #by layer groups

      estimated_time = 0.0
      for i in range(self.maxLGs):
        if self.lgstatus[i]:
          layers_in_group = self.lgwgtarr[self.tolayerIdx][i].GetValue() - self.lgwgtarr[self.fromlayerIdx][i].GetValue() + 1
          remaining_layers = min(self.lgwgtarr[self.tolayerIdx][i].GetValue() - current_layer, layers_in_group)
          #print "remaining_layers: ", str(remaining_layers)

          if remaining_layers > 0:
            exposure = float(self.lgwgtarr[self.exposureIdx][i].GetValue())
            lift = float(self.lgwgtarr[self.liftIdx][i].GetValue())
            upspeed = float(self.lgwgtarr[self.upspeedIdx][i].GetValue())
            downspeed = float(self.lgwgtarr[self.downspeedIdx][i].GetValue())
            delay = float(self.lgwgtarr[self.delayIdx][i].GetValue())

            # 0.5 sec below is a buffer added at the end of exposure before the start of ball screw movement
            time_per_layer = exposure + 0.5 + (lift / upspeed + (lift - thickness) / downspeed ) * 60 + delay
            estimated_time += remaining_layers * time_per_layer

            #print "estimated_time: ", estimated_time
            #estimated_time += remaining_layers * (float(self.lgwgtarr[self.exposureIdx][i].GetValue()) + float(self.lgwgtarr[self.delayIdx][i].GetValue()) + 0.5)
    else:
      if self.specgrid.GetCellValue(0, 0) == "": return
      nRows = self.specgrid.GetNumberRows()
      if not nRows: return
      estimated_time = 0.0
      for i in range(nRows):
        if (self.specgrid.GetCellValue(i, self.exposureIdx-1)!=None) and (i>=current_layer) :
          exposure = float(self.specgrid.GetCellValue(i, self.exposureIdx-1))
          lift = float(self.specgrid.GetCellValue(i, self.liftIdx-1))
          upspeed = float(self.specgrid.GetCellValue(i, self.upspeedIdx-1))
          downspeed = float(self.specgrid.GetCellValue(i, self.downspeedIdx-1))
          delay = float(self.specgrid.GetCellValue(i, self.delayIdx-1))
          estimated_time += exposure + (lift / upspeed + (lift - thickness) / downspeed ) * 60 + delay

    self.estimated_time.SetLabel(time.strftime("%H:%M:%S",time.gmtime(estimated_time)))
    if current_layer <= self.display_frame.blayer+2:
      self.total_time.SetLabel(self.estimated_time.GetLabel())

class FanoffThread (threading.Thread):
  blayer = 0
  dpi = 0
  layers = []
  thickness = 0.0
  size = []
  data = []
  maxRetries = 20
  showgrid = 0
  running = False
  offx = 0.0
  offy = 0.0
  index = 0
  estimated_time = None
  total_time = None
  port1 = None
  pro = None
  def __init__(self, thread_id, name, thread_lock, sendCommand, sendlogCommand):
    threading.Thread.__init__(self)
    self.thread_id = thread_id
    self.name = name
    self.thread_lock = thread_lock
    self.sendCommand = sendCommand
    self.sendlogCommand = sendlogCommand
    # self.sendlogCommand("Starting " + self.name)

  def run(self):
    while True:
      if self.running :
        self.running = False
        self.sendlogCommand("Wait 10 minutes Fan off")
        time.sleep(600)
        self.sendlogCommand("Fan off")
        self.sendCommand("M106 S0")
    '''

class Printer(PrinterInterface, comm.MachineComPrintCallback):
  """
  Default implementation of the :class:`PrinterInterface`. Manages the communication layer object and registers
  itself with it as a callback to react to changes on the communication layer.
  """

  def __init__(self, fileManager, analysisQueue, printerProfileManager):
    from collections import deque

    self._logger = logging.getLogger(__name__)

    self._analysisQueue = analysisQueue
    self._fileManager = fileManager
    self._printerProfileManager = printerProfileManager
    if os.path.isfile('/home/pi/pcflag.txt'):
      self.piflag = 0
    else:
      self.piflag = 1
    # state
    # TODO do we really need to hold the temperature here?
    self._temp = None
    self._bedTemp = None
    self._targetTemp = None
    self._targetBedTemp = None
    self._temps = deque([], 300)
    self._tempBacklog = []

    self._latestMessage = None
    self._messages = deque([], 300)
    self._messageBacklog = []

    self._latestLog = None
    self._log = deque([], 300)
    self._logBacklog = []

    self._state = None

    self._currentZ = None

    self._progress = None
    self._printTime = None
    self._printTimeLeft = None

    self._printAfterSelect = False

    # sd handling
    self._sdPrinting = False
    self._sdStreaming = False
    self._sdFilelistAvailable = threading.Event()
    self._streamingFinishedCallback = None

    self._selectedFile = None
    self._timeEstimationData = None
    self._showworker = None
    # comm
    self._comm = None
    self.selectfile = None
    # callbacks
    self._callbacks = []

    # progress plugins
    self._lastProgressReport = None

    self.maxLGs = 8
    self.lgstatus = [0 for x in range(self.maxLGs)]	# all set to False at initiation
    [self.fromlayerIdx, self.tolayerIdx, self.exposureIdx, self.liftIdx, self.upspeedIdx, self.downspeedIdx, self.delayIdx] = (x for x in range(7))
    self.widgetdftarr = [1, 1, 0.5, 3.0, 50.0, 150.0, 1]	# rise specification widgets default values
    self.lgwgtarr = []	# an array holding the widgets involved in layer group specifications, except the check buttons
    self.checkbtnarr = []	# an array holding layer groups' check button
    flayerarr = []	# an array holding fromlayer spinCtrl's
    tlayerarr = []	# an array holding tolayer spinCtrl's
    exposurearr = []	# an array holding exposure spinCtrl's
    liftarr = []	# an array holding lift(mm) spinCtrl's
    upspeedarr = []	# an array holding up speed(z axis rate) spinCtrl's
    downspeedarr = []	# an array holding down speed(z axis rate) spinCtrl's
    delayarr = []	# an array holding delay spinCtrl's
    self.lgtitles = ["From layer", "To layer", "Exposure (s)", "Lift (mm)", "Up Speed\n(mm/min)", "Down Speed\n(mm/min)", "delay (s)"]
    self.gridtitles = ["Layer", "Exposure", "Lift", "Up Speed", "Down Speed", "delay"]

    self.baudrate = 115200
    self.riseflag = 0
    self.fullscreen_checked = False
    self.calibrate_checked = False
    self.firstlayer_checked = False
    self.red_checked = False
    self.display_frame = None
    self.changeimage = 0
    self.showgridflag = True
    txt = open('/home/pi/OctoPrint/src/octoprint/ver.txt')
    self.ver = txt.read()
    self.pflag = 0
    self.csvflag = 0
    self.vflag = False
    self.zrate = settings().getInt(["printerset", "zrate"])
    line1 = settings().get(["serial", "projector"])
    if line1.find("viewsonic") >=0 :
      self.vflag = True
    self.conname = None
    self._progressPlugins = plugin_manager().get_implementations(ProgressPlugin)

    self._stateMonitor = StateMonitor(
      interval=0.5,
      on_update=self._sendCurrentDataCallbacks,
      on_add_temperature=self._sendAddTemperatureCallbacks,
      on_add_log=self._sendAddLogCallbacks,
      on_add_message=self._sendAddMessageCallbacks
    )
    self._stateMonitor.reset(
      state={"text": self.get_state_string(), "flags": self._getStateFlags()},
      job_data={
        "file": {
          "name": None,
          "size": None,
          "origin": None,
          "date": None,
          "conname": None
        },
        "estimatedPrintTime": None,
        "lastPrintTime": None,
        "filament": {
          "length": None,
          "volume": None
        },
        "ver": self.ver	,
        "pflag": self.pflag,
        "imagename": None,
        "csvflag": self.csvflag,
        "vflag": self.vflag
      },
      progress={"completion": None, "filepos": None, "printTime": None, "printTimeLeft": None},
      current_z=None
    )
    eventManager().subscribe(Events.METADATA_ANALYSIS_FINISHED, self._on_event_MetadataAnalysisFinished)
    eventManager().subscribe(Events.METADATA_STATISTICS_UPDATED, self._on_event_MetadataStatisticsUpdated)
    # time.sleep(1)

  # ~~ handling of PrinterCallbacks
    # time.sleep(5)
    self._interval = 0.5
    # self.startflag = False
    self._last_update = time.time()
    self._change_event = threading.Event()
    self._state_lock = threading.Lock()

    self.display_frame = PrintimgThread(1, "display_frame", self._state_lock, self.printcommand, self.setjobcommand, self.sendlogcommand, self.finish_print)
    self.display_frame.eshutter = True  #settings().getBoolean(["printerset", "shutter"])
    self.display_frame.emask = False # settings().getBoolean(["printerset", "mask"])
    self.display_frame.start()
    # self._state_lock1 = threading.Lock()

    # self.fanoff = FanoffThread(2, "fanoff", self._state_lock1, self.printcommand, self.sendlogcommand)
    # self.fanoff.start()
    # self.showflag = True
    self.offx = 0.0
    self.offy = 0.0
    self.name = 'cv2'
    self.pr = True
    '''
    window_name = self.name
    cv2.namedWindow(window_name, cv2.WND_PROP_FULLSCREEN)
    cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.cv.CV_WINDOW_FULLSCREEN)
    cv2.imshow(window_name, self.blankimg)
    key = cv2.waitKey(500)
    '''
    # self._worker1 = threading.Thread(target=self._work1)
    # self._worker1.daemon = True
    # self._worker1.start()

    # self._worker = threading.Thread(target=self._work)
    # self._worker.daemon = True
    # self._worker.start()
    print "Exiting Main Thread"
  def printcommand(self, cmd):
    self._comm.sendCommand(cmd)
  def sendlogcommand(self, cmd):
    self._comm.sendlog(cmd)
  def setjobcommand(self, current_layer, estimatedPrintTime, pflag):
    if current_layer <= self.display_frame.blayer + 1:
      self.j_averagePrintTime = estimatedPrintTime
    head = None
    tail = None
    if current_layer >= 1:
      imagename = self.layers[0][current_layer - 1]
      tail = os.path.basename(imagename)
      if imagename.find("slices") >=0 :
        tail = "slices/" + tail
    if pflag == 1:
      tail = None
    line1 = settings().get(["serial", "projector"])
    if line1.find("viewsonic") >=0 :
      self.vflag = True
    self._stateMonitor.set_job_data({
      "file": {
        "name": self.j_name,
        "origin": self.j_origin,
        "size": self.j_size,
        "date": self.j_date,
        "layers": self._total_layers,
        "currentlayer": current_layer
      },
      "estimatedPrintTime": estimatedPrintTime,
      "averagePrintTime": self.j_averagePrintTime,
      "lastPrintTime": self.j_lastPrintTime,
      "filament": self.j_filament,
      "ver": self.ver,
      "pflag": pflag,
      "imagename": tail,
      "csvflag": self.csvflag,
      "vflag": self.vflag,
    })

  def get_dpi(self):
    resolution_x_pixels = settings().getInt(["printerset", "xpx"])
    projected_x_mm = settings().getFloat(["printerset", "prox"])
    projected_x_inches = projected_x_mm / 25.4

    return resolution_x_pixels / projected_x_inches
  def start_present(self):
    if not hasattr(self, "layers"):
      print "No model loaded!"
      return
    a = settings().getInt(["printerset", "blayer"])
    b = a
    if b >= 1:
      b = b - 1
    self.display_frame.eshutter = True # settings().getBoolean(["printerset", "shutter"])
    self.display_frame.emask = False # settings().getBoolean(["printerset", "mask"])
    self.display_frame.blayer = b
    self.display_frame.index = b
    self.display_frame.dpi = self.get_dpi()
    self.display_frame.layers = self.layers[0][:]
    self.display_frame.port1 = settings().get(["serial", "port1"])
    self.display_frame.thickness = settings().getFloat(["printerset", "layert"])
    self.display_frame.pro = settings().get(["serial", "projector"])
    olddir = os.getcwd()
    if self.piflag == 1:
      mask_dir = olddir + "/OctoPrint/src/octoprint/"	# tempfile.mkdtemp()
    else:
      mask_dir = olddir + "/src/octoprint/"	# tempfile.mkdtemp()
    line = self.display_frame.pro
    if line.find("OPTOMA") >= 0:
      self.display_frame.maskimg = Image.open(mask_dir+'optoma_mask.png').convert("L")
    if line.find("acer") >= 0:
      self.display_frame.maskimg = Image.open(mask_dir+'acer_mask.png').convert("L")
    if line.find("viewsonic") >=0 :
      self.display_frame.maskimg = Image.open(mask_dir+'viewsonic_mask.png').convert("L")
    # scale = 1#float(self.scale.GetValue())
    self.display_frame.size = (settings().getFloat(["printerset", "xpx"]), settings().getFloat(["printerset", "ypx"]))
    # offset=(float(self.offset_X.GetValue()), float(self.offset_Y.GetValue()))
    offset_x1 = settings().getFloat(["printerset", "offx"]) * 1000 / settings().getFloat(["printerset", "nres"])
    offset_y1 = settings().getFloat(["printerset", "offy"]) * 1000 / settings().getFloat(["printerset", "nres"])
    self.display_frame.offset = (offset_x1, offset_y1)
    printmode = settings().getInt(["printerset", "printmode"])
    
    spec = settings().get(["printerset", "spec"])
    data = []
    if True:	# self.bylgroup_rb.GetValue(): #using by-layer-group specs
      self.display_frame.spectype = "LayerGroup"
      toLayer = 0
      # nRows = 0
      for s1 in spec:
        dataRow = []
        # if self.lgstatus[i]:
        # if not toLayer == int(s1["tolay"]) - 1:
        # 		 print "Error: discontinuous layer designation!"
        # 		 return

        # nRows += 1

        fromLayer = int(s1["fromlay"])
        toLayer = int(s1["tolay"])
        exposure = float(s1["expos"])
        lift = float(s1["lift"])
        upspeed = float(s1["ups"])
        #downspeed = 150  # float(s1["downs"])
        #delay = 0.3  # float(s1["delay"])
        downspeed = float(s1["downs"])
        delay = float(s1["delay"])
        dataRow.append(fromLayer)
        dataRow.append(toLayer)
        dataRow.append(exposure)
        dataRow.append(lift)
        dataRow.append(upspeed)
        dataRow.append(downspeed)
        dataRow.append(delay)

        data.append(dataRow)

    else:	# using by-individual-layer specs
      spectype = "IndividualLayer"

      nRows = self.specgrid.GetNumberRows()
      toLayer = 0
      for i in range(nRows):
        # print "in start_present, i: %d,layer in grid is: %d" %(i, int(self.specgrid.GetCellValue(i, 0)))
        # print "in start_present, toLayer is: %d" %toLayer
        dataRow = []
        if not (toLayer == int(self.specgrid.GetCellValue(i, 0)) - 1):
          print "Error: discontinuous layer designation!"
          return
        toLayer = int(self.specgrid.GetCellValue(i, 0))
        exposure = float(self.specgrid.GetCellValue(i, self.exposureIdx - 1))
        lift = float(self.specgrid.GetCellValue(i, self.liftIdx - 1))
        upspeed = float(self.specgrid.GetCellValue(i, self.upspeedIdx - 1))
        downspeed = float(self.specgrid.GetCellValue(i, self.downspeedIdx - 1))
        delay = float(self.specgrid.GetCellValue(i, self.delayIdx - 1))
        dataRow.append(exposure)
        dataRow.append(lift)
        dataRow.append(upspeed)
        dataRow.append(downspeed)
        dataRow.append(delay)
        data.append(dataRow)
    
      
    self.display_frame.data = data
    self.display_frame.running = True
    # self.total_time.SetLabel(self.estimated_time.GetLabel())
  def register_callback(self, callback):
    if not isinstance(callback, PrinterCallback):
      self._logger.warn("Registering an object as printer callback which doesn't implement the PrinterCallback interface")

    self._callbacks.append(callback)
    self._sendInitialStateUpdate(callback)

  def unregister_callback(self, callback):
    if callback in self._callbacks:
      self._callbacks.remove(callback)

  def _sendAddTemperatureCallbacks(self, data):
    for callback in self._callbacks:
      try: callback.on_printer_add_temperature(data)
      except: self._logger.exception("Exception while adding temperature data point")

  def _sendAddLogCallbacks(self, data):
    for callback in self._callbacks:
      try: callback.on_printer_add_log(data)
      except: self._logger.exception("Exception while adding communication log entry")

  def _sendAddMessageCallbacks(self, data):
    for callback in self._callbacks:
      try: callback.on_printer_add_message(data)
      except: self._logger.exception("Exception while adding printer message")

  def _sendCurrentDataCallbacks(self, data):
    for callback in self._callbacks:
      try: callback.on_printer_send_current_data(copy.deepcopy(data))
      except: self._logger.exception("Exception while pushing current data")

  # ~~ callback from metadata analysis event

  def _on_event_MetadataAnalysisFinished(self, event, data):
    if self._selectedFile:
      self._setJobData(self._selectedFile["filename"],
              self._selectedFile["filesize"],
              self._selectedFile["sd"])

  def _on_event_MetadataStatisticsUpdated(self, event, data):
    self._setJobData(self._selectedFile["filename"],
            self._selectedFile["filesize"],
            self._selectedFile["sd"])

  # ~~ progress plugin reporting

  def _reportPrintProgressToPlugins(self, progress):
    if not progress or not self._selectedFile or not "sd" in self._selectedFile or not "filename" in self._selectedFile:
      return

    storage = "sdcard" if self._selectedFile["sd"] else "local"
    filename = self._selectedFile["filename"]

    def call_plugins(storage, filename, progress):
      for plugin in self._progressPlugins:
        try:
          plugin.on_print_progress(storage, filename, progress)
        except:
          self._logger.exception("Exception while sending print progress to plugin %s" % plugin._identifier)

    thread = threading.Thread(target=call_plugins, args=(storage, filename, progress))
    thread.daemon = False
    thread.start()

  # ~~ PrinterInterface implementation

  def connect(self, port=None, baudrate=None, profile=None):
    """
    Connects to the printer. If port and/or baudrate is provided, uses these settings, otherwise autodetection
    will be attempted.
    """
    if self._comm is not None:
      self._comm.close()
    self._printerProfileManager.select(profile)
    self._comm = comm.MachineCom(port, baudrate, callbackObject=self, printerProfileManager=self._printerProfileManager)

  def disconnect(self):
    """
    Closes the connection to the printer.
    """
    if self._comm is not None:
      self._comm.close()
    self._comm = None
    self._printerProfileManager.deselect()
    eventManager().fire(Events.DISCONNECTED)
    # settings().setFloat(["serial", "zpos"], self._currentZ)
    # settings().save()

  def get_transport(self):

    if self._comm is None:
      return None

    return self._comm.getTransport()
  getTransport = util.deprecated("getTransport has been renamed to get_transport", since="1.2.0-dev-590", includedoc="Replaced by :func:`get_transport`")

  def commands(self, commands):
    """
    Sends one or more gcode commands to the printer.
    """
    if self._comm is None:
      return

    if not isinstance(commands, (list, tuple)):
      commands = [commands]

    for command in commands:
      self._comm.sendCommand(command)

  def autoupdate(self):
    """
    Sends one or more gcode commands to the printer.
    """
    HOST = 'aaa.bbb.ccc.ddd'
    DIRN = 'redacted'
    FILE = 'redacted'
    USER = 'redacted'
    PASS = 'redacted'
    myMAC = open('/sys/class/net/eth0/address').read()
    myMAC = myMAC.replace(":", "")
    self.sendlogcommand("AutoUpdate Begining ID:%s" % myMAC)

    try:
      f = ftplib.FTP()
      f.connect(HOST, 21, timeout=1000)
    except (socket.error, socket.gaierror) , ftplib.Error:
      self.sendlogcommand("ERROR: cannot reach %s" % HOST)
      return
    self.sendlogcommand("*** Connected to host %s" % HOST)
    f.set_pasv(False)
    try:
      f.login(USER, PASS)
    except ftplib.error_perm:
      self.sendlogcommand("ERROR: cannot login ")
      f.quit()
      return
    self.sendlogcommand("*** Logged in as Kudo3d")

    try:
      f.retrbinary('RETR %s' % myMAC,
        open(myMAC, 'wb').write)
    except ftplib.error_perm:
      self.sendlogcommand("ERROR: cannot find ID:%s" % myMAC)
      os.unlink(myMAC)
      f.quit()
      return
    try:
      f.retrbinary('RETR %s' % FILE,
        open(FILE, 'wb').write)
    except ftplib.error_perm:
      self.sendlogcommand("ERROR: cannot read file %s" % FILE)
      os.unlink(FILE)
    else:
      self.sendlogcommand("*** Downloaded %s " % FILE)
    f.quit()
    if not zipfile.is_zipfile(FILE):
      raise Exception(FILE + " is not a zip file!")
    zipFile = zipfile.ZipFile(FILE, 'r')
    zipFile.extractall('.')
    self.sendlogcommand("*** Wait Extract... ")
    time.sleep(30)
    self.sendlogcommand("*** AutoUpdate Done ")
  def script(self, name, context=None):
    if self._comm is None:
      return

    if name is None or not name:
      raise ValueError("name must be set")

    result = self._comm.sendGcodeScript(name, replacements=context)
    if not result:
      raise UnknownScript(name)

  def jog(self, axis, amount):
    if not isinstance(axis, (str, unicode)):
      raise ValueError("axis must be a string: {axis}".format(axis=axis))

    axis = axis.lower()
    if not axis in PrinterInterface.valid_axes:
      raise ValueError("axis must be any of {axes}: {axis}".format(axes=", ".join(PrinterInterface.valid_axes), axis=axis))
    if not isinstance(amount, (int, long, float)):
      raise ValueError("amount must be a valid number: {amount}".format(amount=amount))

    printer_profile = self._printerProfileManager.get_current_or_default()
    movement_speed = 150 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
    self.commands(["G91", "G1 %s%.4f F%d" % (axis.upper(), amount, movement_speed), "G90", "M114"])
    settings().setFloat(["serial", "zpos"], self._currentZ)
    # settings().save()
  def p50mm(self):
    if(self._currentZ < 50):
      amount = 50 -self._currentZ ;
      movement_speed = 250 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( amount, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
  def motor(self):
      movement_speed = 250 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 150, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      movement_speed = 250 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( -150, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      movement_speed = 250 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 150, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      #movement_speed = 250 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      #self.commands(["G91", "G1 Z%.4f F%d" % ( -150, movement_speed), "G90", "M114"])
      #settings().setFloat(["serial", "zpos"], self._currentZ)
  def peek(self):
      movement_speed = 10 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 2, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      movement_speed = 25 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 3, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      movement_speed = 50 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 5, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
      movement_speed = 150 #settings().getInt(["printerset", "zrate"]) #printer_profile["axes"][axis]["speed"]
      self.commands(["G91", "G1 Z%.4f F%d" % ( 50, movement_speed), "G90", "M114"])
      settings().setFloat(["serial", "zpos"], self._currentZ)
  def showgrid1(self):
    if self.showgridflag == True:
      self.display_frame.showgrid = 2
    else:
      self.display_frame.showgrid = 1
    self.showgridflag = not self.showgridflag
  def showgrid(self):
    if self.showgridflag == True:
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      
      
    else:
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
      time.sleep(1)
      self.display_frame.showgrid = 2#full screen white
      time.sleep(1)
      self.display_frame.showgrid = 1#black
    self.showgridflag = not self.showgridflag   
        
  def poweroff(self):
    port1 = settings().get(["serial", "port1"])
    pro = settings().get(["serial", "projector"])
    self.sendlogcommand("Power off Projector")
    if pro == 'OPTOMA':
      self.commands("M101")
    elif pro == 'acer_IR':
      self.commands("M103")
    elif pro == 'viewsonic_IR':
      self.commands("M99")
    else:
      with open('/home/pi/' + pro, "rb") as ins:
        array = []
        for line in ins:
          array.append(line)
      if array[0]:
        baud = int(array[0])
      else:
        baud = 9600
      if array[1]:
        oncmd = array[1]
        oncmd = oncmd.replace("\r\n", "")
      else:
        oncmd = "OKOKOKOKOK\r"
      if array[2]:
        offcmd = array[2]
        offcmd = offcmd.replace("\r\n", "")
      else:
        offcmd = "* 0 IR 002\r"

      try:
        ser = serial.Serial(port1, baud, timeout=10, writeTimeout=10000, parity=serial.PARITY_ODD)
        ser.close()
        ser.parity = serial.PARITY_NONE
        ser.open()
        ser.write(offcmd)
        ser.close()
      except:
        self.sendlogcommand("Projector port open error")
        ser.close()
  def normal(self):
    port1 = settings().get(["serial", "port1"])
    pro = settings().get(["serial", "projector"])
    if pro == 'viewsonic':
      self.sendlogcommand("Lamp Mode Normal")
      baud = 115200
      offcmd = "\x06\x14\x00\x04\x00\x34\x11\x10\x00\x6D"

      try:
        ser = serial.Serial(port1, baud, timeout=10, writeTimeout=10000, parity=serial.PARITY_ODD)
        ser.close()
        ser.parity = serial.PARITY_NONE
        ser.open()
        ser.write(offcmd)
        ser.close()
      except:
        self.sendlogcommand("Projector port open error")
        ser.close()
  def economic(self):
    port1 = settings().get(["serial", "port1"])
    pro = settings().get(["serial", "projector"])
    if pro == 'viewsonic':
      self.sendlogcommand("Lamp Mode Economic")
      baud = 115200
      offcmd = "\x06\x14\x00\x04\x00\x34\x11\x10\x01\x6E"

      try:
        ser = serial.Serial(port1, baud, timeout=10, writeTimeout=10000, parity=serial.PARITY_ODD)
        ser.close()
        ser.parity = serial.PARITY_NONE
        ser.open()
        ser.write(offcmd)
        ser.close()
      except:
        self.sendlogcommand("Projector port open error")
        ser.close()
    if pro == 'acer':
      self.sendlogcommand("Lamp Mode Economic Switch")
      baud = 9600
      offcmd = "\x06\x14\x00\x04\x00\x34\x11\x10\x01\x6E"

      try:
        ser = serial.Serial(port1, baud, timeout=10, writeTimeout=10000, parity=serial.PARITY_ODD)
        ser.close()
        ser.parity = serial.PARITY_NONE
        ser.open()
        ser.write("* 0 IR 008\r")
        time.sleep(0.5)
        ser.write("* 0 IR 010\r")
        time.sleep(0.5)
        ser.write("* 0 IR 010\r")
        time.sleep(0.5)
        ser.write("* 0 IR 010\r")
        time.sleep(0.5)
        ser.write("* 0 IR 011\r")
        time.sleep(0.5)
        ser.write("* 0 IR 011\r")
        time.sleep(0.5)
        ser.write("* 0 IR 008\r")
        time.sleep(0.5)
        ser.write("* 0 IR 008\r")
        time.sleep(0.5)

        ser.close()
      except:
        self.sendlogcommand("Projector port open error")
        ser.close()
  def poweron(self):
    self.commands("M106")
    port1 = settings().get(["serial", "port1"])
    pro = settings().get(["serial", "projector"])
    self.sendlogcommand("Power on Projector")
    if pro == 'OPTOMA':
      self.commands("M100")
    elif pro == 'acer_IR':
      self.commands("M102")
    elif pro == 'viewsonic_IR':
      self.commands("M98")
    else:
      with open('/home/pi/' + pro, "rb") as ins:
        array = []
        for line in ins:
          array.append(line)
      if array[0]:
        baud = int(array[0])
      else:
        baud = 9600
      if array[1]:
        oncmd = array[1]
        oncmd = oncmd.replace("\r\n", "")
      else:
        oncmd = "OKOKOKOKOK\r"
      if array[2]:
        offcmd = array[2]
        offcmd = offcmd.replace("\r\n", "")
      else:
        offcmd = "* 0 IR 002\r"
      try:
        ser = serial.Serial(port1, baud, timeout=10, writeTimeout=10000, parity=serial.PARITY_ODD)
        ser.close()
        ser.parity = serial.PARITY_NONE
        ser.open()
        ser.write(oncmd)
        ser.close()
      except:
        self.sendlogcommand("Projector port open error")
        ser.close()

  def home(self, axis):
    '''if not isinstance(axes, (list, tuple)):
      if isinstance(axes, (str, unicode)):
        axes = [axes]
      else:
        raise ValueError("axes is neither a list nor a string: {axes}".format(axes=axes))

    validated_axes = filter(lambda x: x in PrinterInterface.valid_axes, map(lambda x: x.lower(), axes))
    if len(axes) != len(validated_axes):
      raise ValueError("axes contains invalid axes: {axes}".format(axes=axes))

    self.commands(["G91", "G28 %s" % " ".join(map(lambda x: "%s0" % x.upper(), validated_axes)), "G90"])'''
    # printer_profile = self._printerProfileManager.get_current_or_default()
    # movement_speed = printer_profile["axes"][axis]["speed"]
    #self.commands(["G91", "G1 Z%.4f " % (0.0 - self._currentZ), "G90", "M114"])
    
    self.commands(["G91", "G28 Z0 F10", "G90", "M114"])
    self._currentZ = 0
    settings().setFloat(["serial", "zpos"], self._currentZ)
    settings().save()

  def extrude(self, amount):
    if not isinstance(amount, (int, long, float)):
      raise ValueError("amount must be a valid number: {amount}".format(amount=amount))

    printer_profile = self._printerProfileManager.get_current_or_default()
    extrusion_speed = printer_profile["axes"]["e"]["speed"]
    self.commands(["G91", "G1 E%s F%d" % (amount, extrusion_speed), "G90"])

  def change_tool(self, tool):
    if not PrinterInterface.valid_tool_regex.match(tool):
      raise ValueError("tool must match \"tool[0-9]+\": {tool}".format(tool=tool))

    tool_num = int(tool[len("tool"):])
    self.commands("T%d" % tool_num)

  def set_temperature(self, heater, value):
    if not PrinterInterface.valid_heater_regex.match(heater):
      raise ValueError("heater must match \"tool[0-9]+\" or \"bed\": {heater}".format(type=heater))

    if not isinstance(value, (int, long, float)) or value < 0:
      raise ValueError("value must be a valid number >= 0: {value}".format(value=value))

    if heater.startswith("tool"):
      printer_profile = self._printerProfileManager.get_current_or_default()
      extruder_count = printer_profile["extruder"]["count"]
      if extruder_count > 1:
        toolNum = int(heater[len("tool"):])
        self.commands("M104 T%d S%f" % (toolNum, value))
      else:
        self.commands("M104 S%f" % value)

    elif heater == "bed":
      self.commands("M140 S%f" % value)

  def set_temperature_offset(self, offsets=None):
    if offsets is None:
      offsets = dict()

    if not isinstance(offsets, dict):
      raise ValueError("offsets must be a dict")

    validated_keys = filter(lambda x: PrinterInterface.valid_heater_regex.match(x), offsets.keys())
    validated_values = filter(lambda x: isinstance(x, (int, long, float)), offsets.values())

    if len(validated_keys) != len(offsets):
      raise ValueError("offsets contains invalid keys: {offsets}".format(offsets=offsets))
    if len(validated_values) != len(offsets):
      raise ValueError("offsets contains invalid values: {offsets}".format(offsets=offsets))

    if self._comm is None:
      return

    self._comm.setTemperatureOffset(offsets)
    self._stateMonitor.set_temp_offsets(offsets)

  def _convert_rate_value(self, factor, min=0, max=350):
    if not isinstance(factor, (int, float, long)):
      raise ValueError("factor is not a number")

    if isinstance(factor, float):
      factor = int(factor * 100.0)

    if factor < min or factor > max:
      raise ValueError("factor must be a value between %f and %f" % (min, max))

    return factor

  def feed_rate(self, factor):
    settings().setInt(["printerset", "zrate"], factor)
    self.zrate = factor
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})
    #factor = self._convert_rate_value(factor, min=50, max=350)
    #self.commands("M220 S%d" % factor)

  def flow_rate(self, factor):
    #settings().setInt(["printerset", "zrate"], factor)
    #self.zrate = factor
    factor = self._convert_rate_value(factor, min=75, max=125)
    self.commands("M221 S%d" % factor)

  def parse_3DLP_zip(self, name):
    if not zipfile.is_zipfile(name):
      raise Exception(name + " is not a zip file!")
    accepted_image_types = ['gif', 'tiff', 'jpg', 'jpeg', 'bmp', 'png']
    zipFile = zipfile.ZipFile(name, 'r')
    olddir = os.getcwd()
    if self.piflag == 1:
      self.image_dir = olddir + "/OctoPrint/src/octoprint/static/image"	# tempfile.mkdtemp()
    else:
      self.image_dir = olddir + "/src/octoprint/static/image"	# tempfile.mkdtemp()

    shutil.rmtree(self.image_dir)
    os.mkdir(self.image_dir)
    zipFile.extractall(self.image_dir)
    ol = []
    lst = []
    # Note: the following funky code extracts any numbers from the filenames, matches
    # them with the original then sorts them. It allows for filenames of the
    # format: abc_1.png, which would be followed by abc_10.png alphabetically.
    if os.path.isdir(self.image_dir+"/slices"):
      self.image_dir = self.image_dir+"/slices"
      os.chdir(self.image_dir)
      lst = os.listdir(self.image_dir)
      lst = sorted(lst, key=lambda x: (int(re.sub('\D','',x)),x))
    else:
      os.chdir(self.image_dir)
      lst = os.listdir(self.image_dir)
      lst.sort()
    for f in lst:
      path = os.path.join(self.image_dir, f)
      if os.path.isfile(path) and imghdr.what(path) in accepted_image_types:
        ol.append(path)

    os.chdir(olddir)
    return ol, -1, "bitmap"
  def parse_line(self, s, dmr):
    "This function retrieve sections delimited by dmr"
    s1 = s.split(dmr)
    return s1
  def select_file(self, path, sd, printAfterSelect=False):
    if self._comm is None or (self._comm.isBusy() or self._comm.isStreaming()):
      self._logger.info("Cannot load file: printer not connected or currently busy")
      return

    if path.endswith('.csv') or path.endswith('.CSV'):

      f = open(path, 'r')
      lines = f.readlines()
      f.close()
      line = lines[0]
      if line.find("Slice Thickness") >= 0:
        line = lines[1]
        prs = self.parse_line(line, ",")
        settings().set(["printerset", "layert"], prs[0])
        i = 4
        spec = []
        while i < len(lines):
          line = lines[i].replace("\n", "")
          line = line.replace("\r", "")
          # line = lines[i]
          prs = self.parse_line(line, ",")
          if len(prs) > 5:
            spec.append({"fromlay":prs[0], "tolay":prs[1], "expos":prs[2], "lift":prs[3], "ups":prs[4] , "downs":prs[5], "delay":prs[6]})
          else:
            spec.append({"fromlay":prs[0], "tolay":prs[1], "expos":prs[2], "lift":prs[3], "ups":prs[4], "downs":"50", "delay":"0.3" })
          i += 1
      else:
        i = 2
        spec = []
        while i < len(lines):
          line = lines[i].replace("\n", "")
          line = line.replace("\r", "")
          # line = lines[i]
          prs = self.parse_line(line, ",")
          if len(prs) > 5:
            spec.append({"fromlay":prs[0], "tolay":prs[1], "expos":prs[2], "lift":prs[3], "ups":prs[4] , "downs":prs[5], "delay":prs[6]})
          else:
            spec.append({"fromlay":prs[0], "tolay":prs[1], "expos":prs[2], "lift":prs[3], "ups":prs[4], "downs":"150", "delay":"0.3" })
          i += 1

      settings().set(["printerset", "spec"], spec)
      settings().save()
      self.conname = os.path.basename(path)
      self.csvflag = 1
      path = self.selectfile
      if path == None:
        self.unselect_file()
      else:
        layers = self.parse_3DLP_zip(path)
        self.layers = layers
        self._total_layers = len(layers[0])
        self._current_layer = 1
        self._printAfterSelect = printAfterSelect
        self._comm.selectFile("/" + path if sd else path, sd)
        self._setProgressData(0, None, None, None)
    else:
      layers = self.parse_3DLP_zip(path)
      self.layers = layers
      self._total_layers = len(layers[0])
      self._current_layer = 1
      self._printAfterSelect = printAfterSelect
      self._comm.selectFile("/" + path if sd else path, sd)
      self._setProgressData(0, None, None, None)
      self.selectfile = path
    # self._setCurrentZ(None)

  def unselect_file(self):
    if self._comm is not None and (self._comm.isBusy() or self._comm.isStreaming()):
      return

    self._comm.unselectFile()
    self._setProgressData(0, None, None, None)
    # self._setCurrentZ(None)
  def unselect_file1(self):
    if self._comm is not None and (self._comm.isBusy() or self._comm.isStreaming()):
      return

    self._comm.unselectFile1()
    # self._setProgressData(0, None, None, None)

  def start_print(self):
    """
    Starts the currently loaded print job.
    Only starts if the printer is connected and operational, not currently printing and a printjob is loaded
    """
    if self._comm is None or not self._comm.isOperational() or self._comm.isPrinting():
      return
    if self._selectedFile is None:
      return
    self.commands("M42 P10 S255")#Fan On
    self.commands("M106")#LED On
    self.commands("M280 P0 S30")#LCD On
    settings().setFloat(["serial", "zpos"], self._currentZ)
    settings().save()
    self.display_frame.showgrid = 0

    rolling_window = None
    threshold = None
    countdown = None
    if self._selectedFile["sd"]:
      # we are interesting in a rolling window of roughly the last 15s, so the number of entries has to be derived
      # by that divided by the sd status polling interval
      rolling_window = 15 / settings().get(["serial", "timeout", "sdStatus"])

      # we are happy if the average of the estimates stays within 60s of the prior one
      threshold = 60

      # we are happy when one rolling window has been stable
      countdown = rolling_window
    self._timeEstimationData = TimeEstimationHelper(rolling_window=rolling_window, threshold=threshold, countdown=countdown)

    self._lastProgressReport = None
    # self._setCurrentZ(None)
    # self._setState(self._comm.STATE_PRINTING)
    self._comm.startPrint()
    self.display_frame.sendCommand = self._comm.sendCommand
    self.start_present()
    # while self.pr:

      # self._comm._changeState(self._comm.STATE_PRINTING)
      # self._comm.startPrint()
      # self.start_present()
      # self.cancel_print1()
    '''
    cv2.imshow(self.name, self.workimg)
    key = cv2.waitKey(500)
    cv2.imshow(self.name, self.blankimg)
    self._comm.sendCommand("G91")
    self._comm.sendCommand("G1 Z1")
    self._comm.sendCommand("G90")
    self._comm.sendCommand("M114")
    key = cv2.waitKey(2000)
      #time.sleep(2)
'''
  def toggle_pause_print(self):
    """
    Pause the current printjob.
    """
    if self._comm is None:
      return
    if self.display_frame.pauseflag == 0:
      return
    #while self.display_frame.pauseflag == 0:
    #	time.sleep(0.01)
    settings().setFloat(["serial", "zpos"], self._currentZ)
    settings().save()
    if not self._comm.isPaused():
      self.display_frame.showgrid = 0
      self.display_frame.running = False
      self._comm._log("Pause")
      self._comm._log("Zpos =%f" % self._stateMonitor._current_z)
      self.pzpos = self._stateMonitor._current_z
      self._comm.setPause(not self._comm.isPaused())
    else:
      self._comm.setPause(not self._comm.isPaused())
      self._comm._log("Resume")
      self._comm._log("Now Zpos =%f" % self._stateMonitor._current_z)
      fzpos = float(self._stateMonitor._current_z) - float(self.pzpos)
      if fzpos >= 0:
        self._comm.sendCommand("G91")
        self._comm.sendCommand("G1 Z-%f F%g" % (fzpos, 150,))
        self._comm.sendCommand("G90")
        self._comm.sendCommand("M114")
        delay = (fzpos / 150) * 60
        time.sleep(delay + 1)
        self._comm._log("Resumed Zpos =%f" % self.pzpos)
      else:
        self._comm.sendCommand("G91")
        self._comm.sendCommand("G1 Z%f F%g" % (0 - fzpos, 30,))
        self._comm.sendCommand("G90")
        self._comm.sendCommand("M114")
        delay = ((0 - fzpos) / 30) * 60
        time.sleep(delay + 1)
        self._comm._log("Resumed Zpos =%f" % self.pzpos)
      self.display_frame.showgrid = 0
      self.display_frame.running = True

  def cancel_print(self):
    """
    Cancel the current printjob.
    """
    self.display_frame.showgrid = 0
    self.display_frame.running = False
    self.pr = False
    if self._comm is None:
      return

    settings().setFloat(["serial", "zpos"], self._currentZ)
    settings().save()
    self._comm.cancelPrint()

    # reset progress, height, print time
    # self._setCurrentZ(None)
    self._setProgressData(None, None, None, None)

    # mark print as failure
    if self._selectedFile is not None:
      self._fileManager.log_print(FileDestinations.SDCARD if self._selectedFile["sd"] else FileDestinations.LOCAL, self._selectedFile["filename"], time.time(), self._comm.getPrintTime(), False, self._printerProfileManager.get_current_or_default()["id"])
      payload = {
        "file": self._selectedFile["filename"],
        "origin": FileDestinations.LOCAL
      }
      if self._selectedFile["sd"]:
        payload["origin"] = FileDestinations.SDCARD
      eventManager().fire(Events.PRINT_FAILED, payload)
  def finish_print(self):
    """
    finish the current printjob.
    """
    # self.fanoff.running = True
    self.display_frame.showgrid = 0
    self.display_frame.running = False
    self.pr = False
    if self._comm is None:
      return

    settings().setFloat(["serial", "zpos"], self._currentZ)
    settings().save()
    self._comm.cancelPrint()

    # reset progress, height, print time
    # self._setCurrentZ(None)
    self._setProgressData(None, None, None, None)

    # mark print as failure
    if self._selectedFile is not None:
      self._fileManager.log_print(FileDestinations.SDCARD if self._selectedFile["sd"] else FileDestinations.LOCAL, self._selectedFile["filename"], time.time(), self._comm.getPrintTime(), False, self._printerProfileManager.get_current_or_default()["id"])
      payload = {
        "file": self._selectedFile["filename"],
        "origin": FileDestinations.LOCAL
      }
      if self._selectedFile["sd"]:
        payload["origin"] = FileDestinations.SDCARD
      eventManager().fire(Events.PRINT_FAILED, payload)
      # self._comm._log("Wait 600s")
      # time.sleep(600)
      # self._comm._log("Fan off")
      # self._comm.sendCommand("M106 S0")
  def get_state_string(self):
    """
    Returns a human readable string corresponding to the current communication state.
    """
    if self._comm is None:
      return "Offline"
    else:
      return self._comm.getStateString()

  def get_current_data(self):
    return self._stateMonitor.get_current_data()

  def get_current_job(self):
    currentData = self._stateMonitor.get_current_data()
    return currentData["job"]

  def get_current_temperatures(self):
    if self._comm is not None:
      offsets = self._comm.getOffsets()
    else:
      offsets = dict()

    result = {}
    if self._temp is not None:
      for tool in self._temp.keys():
        result["tool%d" % tool] = {
          "actual": self._temp[tool][0],
          "target": self._temp[tool][1],
          "offset": offsets[tool] if tool in offsets and offsets[tool] is not None else 0
        }
    if self._bedTemp is not None:
      result["bed"] = {
        "actual": self._bedTemp[0],
        "target": self._bedTemp[1],
        "offset": offsets["bed"] if "bed" in offsets and offsets["bed"] is not None else 0
      }

    return result

  def get_temperature_history(self):
    return self._temps

  def get_current_connection(self):
    if self._comm is None:
      return "Closed", None, None, None

    port, baudrate = self._comm.getConnection()
    printer_profile = self._printerProfileManager.get_current_or_default()
    return self._comm.getStateString(), port, baudrate, printer_profile

  def is_closed_or_error(self):
    return self._comm is None or self._comm.isClosedOrError()

  def is_operational(self):
    return self._comm is not None and self._comm.isOperational()

  def is_printing(self):
    return self._comm is not None and self._comm.isPrinting()

  def is_paused(self):
    return self._comm is not None and self._comm.isPaused()

  def is_error(self):
    return self._comm is not None and self._comm.isError()

  def is_ready(self):
    return self.is_operational() and not self._comm.isStreaming()

  def is_sd_ready(self):
    if not settings().getBoolean(["feature", "sdSupport"]) or self._comm is None:
      return False
    else:
      return self._comm.isSdReady()

  # ~~ sd file handling

  def get_sd_files(self):
    if self._comm is None or not self._comm.isSdReady():
      return []
    return map(lambda x: (x[0][1:], x[1]), self._comm.getSdFiles())

  def add_sd_file(self, filename, absolutePath, streamingFinishedCallback):
    if not self._comm or self._comm.isBusy() or not self._comm.isSdReady():
      self._logger.error("No connection to printer or printer is busy")
      return

    self._streamingFinishedCallback = streamingFinishedCallback

    self.refresh_sd_files(blocking=True)
    existingSdFiles = map(lambda x: x[0], self._comm.getSdFiles())

    remoteName = util.get_dos_filename(filename, existing_filenames=existingSdFiles, extension="gco")
    self._timeEstimationData = TimeEstimationHelper()
    self._comm.startFileTransfer(absolutePath, filename, "/" + remoteName)

    return remoteName

  def delete_sd_file(self, filename):
    if not self._comm or not self._comm.isSdReady():
      return
    self._comm.deleteSdFile("/" + filename)

  def init_sd_card(self):
    if not self._comm or self._comm.isSdReady():
      return
    self._comm.initSdCard()

  def release_sd_card(self):
    if not self._comm or not self._comm.isSdReady():
      return
    self._comm.releaseSdCard()

  def refresh_sd_files(self, blocking=False):
    """
    Refreshs the list of file stored on the SD card attached to printer (if available and printer communication
    available). Optional blocking parameter allows making the method block (max 10s) until the file list has been
    received (and can be accessed via self._comm.getSdFiles()). Defaults to an asynchronous operation.
    """
    if not self._comm or not self._comm.isSdReady():
      return
    self._sdFilelistAvailable.clear()
    self._comm.refreshSdFiles()
    if blocking:
      self._sdFilelistAvailable.wait(10000)

  # ~~ state monitoring

  def _setCurrentZ(self, currentZ):
    self._currentZ = currentZ
    self._stateMonitor.set_current_z(self._currentZ)

  def _setState(self, state):
    self._state = state
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

  def _addLog(self, log):
    self._log.append(log)
    self._stateMonitor.add_log(log)

  def _addMessage(self, message):
    self._messages.append(message)
    self._stateMonitor.add_message(message)

  def _estimateTotalPrintTime(self, progress, printTime):
    if not progress or not printTime or not self._timeEstimationData:
      return None

    else:
      newEstimate = printTime / progress
      self._timeEstimationData.update(newEstimate)

      result = None
      if self._timeEstimationData.is_stable():
        result = self._timeEstimationData.average_total_rolling

      return result

  def _setProgressData(self, progress, filepos, printTime, cleanedPrintTime):
    estimatedTotalPrintTime = self._estimateTotalPrintTime(progress, cleanedPrintTime)
    totalPrintTime = estimatedTotalPrintTime

    if self._selectedFile and "estimatedPrintTime" in self._selectedFile and self._selectedFile["estimatedPrintTime"]:
      statisticalTotalPrintTime = self._selectedFile["estimatedPrintTime"]
      if progress and cleanedPrintTime:
        if estimatedTotalPrintTime is None:
          totalPrintTime = statisticalTotalPrintTime
        else:
          if progress < 0.5:
            sub_progress = progress * 2
          else:
            sub_progress = 1.0
          totalPrintTime = (1 - sub_progress) * statisticalTotalPrintTime + sub_progress * estimatedTotalPrintTime

    self._progress = progress
    self._printTime = printTime
    self._printTimeLeft = totalPrintTime - cleanedPrintTime if (totalPrintTime is not None and cleanedPrintTime is not None) else None

    self._stateMonitor.set_progress({
      "completion": self._progress * 100 if self._progress is not None else None,
      "filepos": filepos,
      "printTime": int(self._printTime) if self._printTime is not None else None,
      "printTimeLeft": int(self._printTimeLeft) if self._printTimeLeft is not None else None
    })

    if progress:
      progress_int = int(progress * 100)
      if self._lastProgressReport != progress_int:
        self._lastProgressReport = progress_int
        self._reportPrintProgressToPlugins(progress_int)


  def _addTemperatureData(self, temp, bedTemp):
    currentTimeUtc = int(time.time())

    data = {
      "time": currentTimeUtc
    }
    for tool in temp.keys():
      data["tool%d" % tool] = {
        "actual": temp[tool][0],
        "target": temp[tool][1]
      }
    if bedTemp is not None and isinstance(bedTemp, tuple):
      data["bed"] = {
        "actual": bedTemp[0],
        "target": bedTemp[1]
      }

    self._temps.append(data)

    self._temp = temp
    self._bedTemp = bedTemp

    self._stateMonitor.add_temperature(data)

  def _setJobData(self, filename, filesize, sd):
    if filename is not None:
      if sd:
        path_in_storage = filename
        path_on_disk = None
      else:
        path_in_storage = self._fileManager.path_in_storage(FileDestinations.LOCAL, filename)
        path_on_disk = self._fileManager.path_on_disk(FileDestinations.LOCAL, filename)
      self._selectedFile = {
        "filename": path_in_storage,
        "filesize": filesize,
        "sd": sd,
        "estimatedPrintTime": None
      }
    else:
      line1 = settings().get(["serial", "projector"])
      if line1.find("viewsonic") >=0 :
        self.vflag = True
      self._selectedFile = None
      self._stateMonitor.set_job_data({
        "file": {
          "name": None,
          "origin": None,
          "size": None,
          "date": None,
          "layers": None,
          "currentlayer": None,
          "conname": None
        },
        "estimatedPrintTime": None,
        "averagePrintTime": None,
        "lastPrintTime": None,
        "filament": None,
        "ver": self.ver,
        "pflag": self.pflag,
        "imagename": None,
        "csvflag": self.csvflag,
        "vflag": self.vflag,
      })
      return

    estimatedPrintTime = None
    lastPrintTime = None
    averagePrintTime = None
    date = None
    filament = None
    if path_on_disk:
      # Use a string for mtime because it could be float and the
      # javascript needs to exact match
      if not sd:
        date = int(os.stat(path_on_disk).st_ctime)

      try:
        fileData = self._fileManager.get_metadata(FileDestinations.SDCARD if sd else FileDestinations.LOCAL, path_on_disk)
      except:
        fileData = None
      if fileData is not None:
        if "analysis" in fileData:
          if estimatedPrintTime is None and "estimatedPrintTime" in fileData["analysis"]:
            estimatedPrintTime = fileData["analysis"]["estimatedPrintTime"]
          if "filament" in fileData["analysis"].keys():
            filament = fileData["analysis"]["filament"]
        if "statistics" in fileData:
          printer_profile = self._printerProfileManager.get_current_or_default()["id"]
          if "averagePrintTime" in fileData["statistics"] and printer_profile in fileData["statistics"]["averagePrintTime"]:
            averagePrintTime = fileData["statistics"]["averagePrintTime"][printer_profile]
          if "lastPrintTime" in fileData["statistics"] and printer_profile in fileData["statistics"]["lastPrintTime"]:
            lastPrintTime = fileData["statistics"]["lastPrintTime"][printer_profile]

        if averagePrintTime is not None:
          self._selectedFile["estimatedPrintTime"] = averagePrintTime
        elif estimatedPrintTime is not None:
          # TODO apply factor which first needs to be tracked!
          self._selectedFile["estimatedPrintTime"] = estimatedPrintTime
    self.j_name = path_in_storage
    self.j_origin = FileDestinations.SDCARD if sd else FileDestinations.LOCAL
    self.j_size = filesize
    self.j_date = date
    self.j_averagePrintTime = None
    self.j_lastPrintTime = lastPrintTime
    self.j_filament = filament
    line1 = settings().get(["serial", "projector"])
    if line1.find("viewsonic") >=0 :
      self.vflag = True

    self._stateMonitor.set_job_data({
      "file": {
        "name": path_in_storage,
        "origin": FileDestinations.SDCARD if sd else FileDestinations.LOCAL,
        "size": filesize,
        "date": date,
        "layers": self._total_layers,
        "currentlayer": self._current_layer,
        "conname": self.conname
      },
      "estimatedPrintTime": estimatedPrintTime,
      "averagePrintTime": None,
      "lastPrintTime": lastPrintTime,
      "filament": filament,
      "ver": self.ver,
      "pflag": self.pflag,
      "imagename": None,
      "csvflag": self.csvflag,
      "vflag": self.vflag,
    })

  def _sendInitialStateUpdate(self, callback):
    try:
      data = self._stateMonitor.get_current_data()
      data.update({
        "temps": list(self._temps),
        "logs": list(self._log),
        "messages": list(self._messages)
      })
      callback.on_printer_send_initial_data(data)
    except Exception, err:
      import sys
      sys.stderr.write("ERROR: %s\n" % str(err))
      pass

  def _getStateFlags(self):
    return {
      "operational": self.is_operational(),
      "printing": self.is_printing(),
      "closedOrError": self.is_closed_or_error(),
      "error": self.is_error(),
      "paused": self.is_paused(),
      "ready": self.is_ready(),
      "sdReady": self.is_sd_ready(),
      "zrate": self.zrate
    }

  # ~~ comm.MachineComPrintCallback implementation

  def on_comm_log(self, message):
    """
    Callback method for the comm object, called upon log output.
    """
    self._addLog(message)

  def on_comm_temperature_update(self, temp, bedTemp):
    self._addTemperatureData(temp, bedTemp)

  def on_comm_state_change(self, state):
    """
    Callback method for the comm object, called if the connection state changes.
    """
    oldState = self._state

    # forward relevant state changes to gcode manager
    '''
    if self._comm is not None and oldState == self._comm.STATE_PRINTING:
      if self._selectedFile is not None:
        if state == self._comm.STATE_OPERATIONAL:
          self._fileManager.log_print(FileDestinations.SDCARD if self._selectedFile["sd"] else FileDestinations.LOCAL, self._selectedFile["filename"], time.time(), self._comm.getPrintTime(), True, self._printerProfileManager.get_current_or_default()["id"])
        elif state == self._comm.STATE_CLOSED or state == self._comm.STATE_ERROR or state == self._comm.STATE_CLOSED_WITH_ERROR:
          self._fileManager.log_print(FileDestinations.SDCARD if self._selectedFile["sd"] else FileDestinations.LOCAL, self._selectedFile["filename"], time.time(), self._comm.getPrintTime(), False, self._printerProfileManager.get_current_or_default()["id"])
      #self._analysisQueue.resume() # printing done, put those cpu cycles to good use
    #elif self._comm is not None and state == self._comm.STATE_PRINTING:
      #self._analysisQueue.pause() # do not analyse files while printing
      '''
    self._setState(state)

  def on_comm_message(self, message):
    """
    Callback method for the comm object, called upon message exchanges via serial.
    Stores the message in the message buffer, truncates buffer to the last 300 lines.
    """
    self._addMessage(message)

  def on_comm_progress(self):
    """
    Callback method for the comm object, called upon any change in progress of the printjob.
    Triggers storage of new values for printTime, printTimeLeft and the current progress.
    """

    self._setProgressData(self._comm.getPrintProgress(), self._comm.getPrintFilepos(), self._comm.getPrintTime(), self._comm.getCleanedPrintTime())

  def on_comm_z_change(self, newZ):
    """
    Callback method for the comm object, called upon change of the z-layer.
    """
    oldZ = self._currentZ
    if newZ != oldZ:
      # we have to react to all z-changes, even those that might "go backward" due to a slicer's retraction or
      # anti-backlash-routines. Event subscribes should individually take care to filter out "wrong" z-changes
      eventManager().fire(Events.Z_CHANGE, {"new": newZ, "old": oldZ})
      # settings().setFloat(["serial", "zpos"], newZ)
      # settings().save()

    self._setCurrentZ(newZ)

  def on_comm_sd_state_change(self, sdReady):
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

  def on_comm_sd_files(self, files):
    eventManager().fire(Events.UPDATED_FILES, {"type": "gcode"})
    self._sdFilelistAvailable.set()

  def on_comm_file_selected(self, filename, filesize, sd):
    self._setJobData(filename, filesize, sd)
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

    if self._printAfterSelect:
      self.start_print()

  def on_comm_print_job_done(self):
    self._setProgressData(1.0, self._selectedFile["filesize"], self._comm.getPrintTime(), 0)
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

  def on_comm_file_transfer_started(self, filename, filesize):
    self._sdStreaming = True

    self._setJobData(filename, filesize, True)
    self._setProgressData(0.0, 0, 0, None)
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

  def on_comm_file_transfer_done(self, filename):
    self._sdStreaming = False

    if self._streamingFinishedCallback is not None:
      # in case of SD files, both filename and absolutePath are the same, so we set the (remote) filename for
      # both parameters
      self._streamingFinishedCallback(filename, filename, FileDestinations.SDCARD)

    # self._setCurrentZ(None)
    self._setJobData(None, None, None)
    self._setProgressData(None, None, None, None)
    self._stateMonitor.set_state({"text": self.get_state_string(), "flags": self._getStateFlags()})

  def on_comm_force_disconnect(self):
    self.disconnect()


class StateMonitor(object):
  def __init__(self, interval=0.5, on_update=None, on_add_temperature=None, on_add_log=None, on_add_message=None):
    self._interval = interval
    self._update_callback = on_update
    self._on_add_temperature = on_add_temperature
    self._on_add_log = on_add_log
    self._on_add_message = on_add_message

    self._state = None
    self._job_data = None
    self._gcode_data = None
    self._sd_upload_data = None
    self._current_z = None
    self._progress = None

    self._offsets = {}

    self._change_event = threading.Event()
    self._state_lock = threading.Lock()

    self._last_update = time.time()
    self._worker = threading.Thread(target=self._work)
    self._worker.daemon = True
    self._worker.start()

  def reset(self, state=None, job_data=None, progress=None, current_z=None):
    self.set_state(state)
    self.set_job_data(job_data)
    self.set_progress(progress)
    self.set_current_z(current_z)

  def add_temperature(self, temperature):
    self._on_add_temperature(temperature)
    self._change_event.set()

  def add_log(self, log):
    self._on_add_log(log)
    self._change_event.set()

  def add_message(self, message):
    self._on_add_message(message)
    self._change_event.set()

  def set_current_z(self, current_z):
    self._current_z = current_z
    self._change_event.set()
  # def set_state(self, state):
  # 		 with self._state_lock:
  # 				 self._state = state
  # 				 self._change_event.set()
  def set_state(self, state):
    self._state = state
    self._change_event.set()

  def set_job_data(self, job_data):
    self._job_data = job_data
    self._change_event.set()

  def set_progress(self, progress):
    self._progress = progress
    self._change_event.set()

  def set_temp_offsets(self, offsets):
    self._offsets = offsets
    self._change_event.set()

  def _work(self):
    while True:
      self._change_event.wait()

      with self._state_lock:
        # print "statemonitor"
        now = time.time()
        delta = now - self._last_update
        additional_wait_time = self._interval - delta
        if additional_wait_time > 0:
          time.sleep(additional_wait_time)

        data = self.get_current_data()
        self._update_callback(data)
        self._last_update = time.time()
        self._change_event.clear()

  def get_current_data(self):
    return {
      "state": self._state,
      "job": self._job_data,
      "currentZ": self._current_z,
      "progress": self._progress,
      "offsets": self._offsets,
    }
