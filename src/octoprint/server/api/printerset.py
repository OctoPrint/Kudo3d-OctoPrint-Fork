# coding=utf-8
from __future__ import absolute_import

__author__ = "Gina Häußge <osd@foosel.net>"
__license__ = 'GNU Affero General Public License http://www.gnu.org/licenses/agpl.html'
__copyright__ = "Copyright (C) 2014 The OctoPrint Project - Released under terms of the AGPLv3 License"

from flask import request, jsonify, make_response

from octoprint.settings import settings
from octoprint.printer import get_connection_options
from octoprint.server import	printerProfileManager, NO_CONTENT
from octoprint.filemanager.destinations import FileDestinations
from octoprint.settings import settings, valid_boolean_trues
from octoprint.server import printer, fileManager, slicingManager, eventManager, NO_CONTENT
from octoprint.server.util.flask import restricted_access, get_json_command_from_request
from octoprint.server.api import api
from octoprint.events import Events
import octoprint.util as util
import octoprint.filemanager

@api.route("/printerset1", methods=["GET"])
def printersetState1():
	state, port, baudrate, printer_profile = printer.get_current_connection()
	printer.csvflag = 0
	current = {
		"layert": settings().get(["printerset", "layert"]),
		"spec": settings().get(["printerset", "spec"]),
	}
	
	return jsonify({"current": current})


@api.route("/printerset", methods=["GET"])
def printersetState():
	state, port, baudrate, printer_profile = printer.get_current_connection()
	current = {
		"blayer": settings().get(["printerset", "blayer"]),
		"xpx": settings().get(["printerset", "xpx"]),
		"layert": settings().get(["printerset", "layert"]),
		"ypx": settings().get(["printerset", "ypx"]),
		"prox": settings().get(["printerset", "prox"]),
		"offx": settings().get(["printerset", "offx"]),
		"offy": settings().get(["printerset", "offy"]),
		"nres": settings().get(["printerset", "nres"]),
		"spec": settings().get(["printerset", "spec"]),
		"shutter": settings().get(["printerset", "shutter"]),
		"mask": settings().get(["printerset", "mask"])
	}
	return jsonify({"current": current})


@api.route("/printerset", methods=["POST"])
@restricted_access
def printersetCommand():
	valid_commands = {
		"save": [],
	}

	command, data, response = get_json_command_from_request(request, valid_commands)
	if response is not None:
		return response

	if command == "save":
		settings().set(["printerset", "blayer"],data["blayer"])
		settings().set(["printerset", "xpx"],data["xpx"])
		settings().set(["printerset", "layert"],data["layert"])
		settings().set(["printerset", "ypx"],data["ypx"])
		settings().set(["printerset", "prox"],data["prox"])
		settings().set(["printerset", "offx"],data["offx"])
		settings().set(["printerset", "offy"],data["offy"])
		settings().set(["printerset", "nres"],data["nres"])
		settings().set(["printerset", "spec"],data["spec"])
		settings().set(["printerset", "shutter"],data["shutter"])
		settings().set(["printerset", "mask"],data["mask"])
		settings().set(["printerset", "printmode"],data["printmode"])
		settings().save()
	return NO_CONTENT
@api.route("/printerset2", methods=["POST"])
@restricted_access
def printersetCommand2():
	valid_commands = {
		"save": [],
	}

	command, data, response = get_json_command_from_request(request, valid_commands)
	if response is not None:
		return response

	if command == "save":
		if printer.piflag == 1:
			upload_dir = "/root/.octoprint/uploads/"	# tempfile.mkdtemp()
		else:
			upload_dir = "/home/maxchen/.octoprint/uploads/"	# tempfile.mkdtemp()
		f = open(upload_dir+data["filename"], 'w')
		# Header information


		f.write(data["content"])
		f.close()
		#added_file = fileManager.add_file(FileDestinations.LOCAL, data["filename"], data["content"], allow_overwrite=True)
		eventManager.fire(Events.UPLOAD, {"file": data["filename"], "target": "local"})
		eventManager.fire(Events.UPDATED_FILES, dict(type="printables"))
	return NO_CONTENT
