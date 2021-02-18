$(function() {
    function ControlViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];

        self._createToolEntry = function () {
            return {
                name: ko.observable(),
                key: ko.observable()
            };
        };
        
        //terminal
        self.log = ko.observableArray([]);
        self.buffer = ko.observable(300);
        self.command = ko.observable(undefined);
        self.Ver = ko.observable(undefined);
        self.ssid = ko.observable(undefined);
        self.password = ko.observable(undefined);
        self.autoscrollEnabled = ko.observable(true);
        self.filters = self.settings.terminalFilters;
        self.filterRegex = ko.observable();
        self.cmdHistory = [];
        self.cmdHistoryIdx = -1;
        //end---terminal
        
        self.isErrorOrClosed = ko.observable(undefined);
        self.iszenable = ko.observable(false);
        self.iszenable2 = ko.observable(false);
        self.iszenable3 = ko.observable(false);
        self.vflag = ko.observable(false);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.extrusionAmount = ko.observable(undefined);
        self.controls = ko.observableArray([]);

        self.tools = ko.observableArray([]);

        self.feedRate = ko.observable();
        self.flowRate = ko.observable(200);//normal flow rate set

        self.feedbackControlLookup = {};

        self.controlsFromServer = [];
        self.additionalControls = [];

        self.webcamDisableTimeout = undefined;

        self.zbuttonText = ko.observable("Enable     Cal");
        self.zbuttonText2 = ko.observable("OFF");
        self.keycontrolActive = ko.observable(false);
        self.keycontrolHelpActive = ko.observable(false);
        self.keycontrolPossible = ko.computed(function () {
            return self.isOperational() && !self.isPrinting() && self.loginState.isUser() && !$.browser.mobile;
        });
        self.showKeycontrols = ko.computed(function () {
            return self.keycontrolActive() && self.keycontrolPossible();
        });

        self.settings.printerProfiles.currentProfileData.subscribe(function () {
            self._updateExtruderCount();
            self.settings.printerProfiles.currentProfileData().extruder.count.subscribe(self._updateExtruderCount);
        });
        self.zenable = 0;
        self.zzero = function() {
            if (self.zenable == 1)
            {
                self.zenable = 0;
                self.iszenable(false);
                self.zbuttonText("Enable     Cal");
                }
            else
            {
                self.zenable = 1;
                self.iszenable(true);
                self.zbuttonText("Disable Cal");
                }
            console.log(self.zenable);
            return self.iszenable();    
                
        };
        self._updateExtruderCount = function () {
            var tools = [];

            var numExtruders = self.settings.printerProfiles.currentProfileData().extruder.count();
            if (numExtruders > 1) {
                // multiple extruders
                for (var extruder = 0; extruder < numExtruders; extruder++) {
                    tools[extruder] = self._createToolEntry();
                    tools[extruder]["name"](gettext("Tool") + " " + extruder);
                    tools[extruder]["key"]("tool" + extruder);
                }
            } else {
                // only one extruder, no need to add numbers
                tools[0] = self._createToolEntry();
                tools[0]["name"](gettext("Hotend"));
                tools[0]["key"]("tool0");
            }

            self.tools(tools);
        };

        self.fromCurrentData = function (data) {
            self._processStateData(data.state);
            self._processJobData(data.job);
        };

        self.fromHistoryData = function (data) {
            self._processStateData(data.state);
        };

        self._processStateData = function (data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
            //self.vflag(data.flags.vflag);
            self.feedRate(data.flags.zrate);
        };
        self._processJobData = function(data) {
            self.vflag(data.vflag);
            //self.feedRate(data.zrate);
       };

        self.onEventRegisteredMessageReceived = function(payload) {
            if (payload.key in self.feedbackControlLookup) {
                var outputs = self.feedbackControlLookup[payload.key];
                _.each(payload.outputs, function(value, key) {
                    if (outputs.hasOwnProperty(key)) {
                        outputs[key](value);
                    }
                });
            }
        };

        self.rerenderControls = function () {
            var allControls = self.controlsFromServer.concat(self.additionalControls);
            self.controls(self._processControls(allControls))
        };

        self.requestData = function () {
            $.ajax({
                url: API_BASEURL + "printer/command/custom",
                method: "GET",
                dataType: "json",
                success: function (response) {
                    self._fromResponse(response);
                }
            });
        };

        self._fromResponse = function (response) {
            self.controlsFromServer = response.controls;
            self.rerenderControls();
        };

        self._processControls = function (controls) {
            for (var i = 0; i < controls.length; i++) {
                controls[i] = self._processControl(controls[i]);
            }
            return controls;
        };

        self._processControl = function (control) {
            if (control.hasOwnProperty("processed") && control.processed) {
                return control;
            }

            if (control.hasOwnProperty("template") && control.hasOwnProperty("key") && control.hasOwnProperty("template_key") && !control.hasOwnProperty("output")) {
                control.output = ko.observable("");
                if (!self.feedbackControlLookup.hasOwnProperty(control.key)) {
                    self.feedbackControlLookup[control.key] = {};
                }
                self.feedbackControlLookup[control.key][control.template_key] = control.output;
            }

            if (control.hasOwnProperty("children")) {
                control.children = self._processControls(control.children);
                if (!control.hasOwnProperty("layout") || !(control.layout == "vertical" || control.layout == "horizontal")) {
                    control.layout = "vertical";
                }
            }

            if (control.hasOwnProperty("input")) {
                for (var i = 0; i < control.input.length; i++) {
                    control.input[i].value = ko.observable(control.input[i].default);
                    if (!control.input[i].hasOwnProperty("slider")) {
                        control.input[i].slider = false;
                    }
                }
            }

            var js;
            if (control.hasOwnProperty("javascript")) {
                js = control.javascript;

                // if js is a function everything's fine already, but if it's a string we need to eval that first
                if (!_.isFunction(js)) {
                    control.javascript = function (data) {
                        eval(js);
                    };
                }
            }

            if (control.hasOwnProperty("enabled")) {
                js = control.enabled;

                // if js is a function everything's fine already, but if it's a string we need to eval that first
                if (!_.isFunction(js)) {
                    control.enabled = function (data) {
                        return eval(js);
                    }
                }
            }

            control.processed = true;
            return control;
        };

        self.isCustomEnabled = function (data) {
            if (data.hasOwnProperty("enabled")) {
                return data.enabled(data);
            } else {
                return self.isOperational() && self.loginState.isUser();
            }
        };

        self.clickCustom = function (data) {
            var callback;
            if (data.hasOwnProperty("javascript")) {
                callback = data.javascript;
            } else {
                callback = self.sendCustomCommand;
            }

            if (data.confirm) {
                var confirmationDialog = $("#confirmation_dialog");
                var confirmationDialogAck = $(".confirmation_dialog_acknowledge", confirmationDialog);

                $(".confirmation_dialog_message", confirmationDialog).text(data.confirm);
                confirmationDialogAck.unbind("click");
                confirmationDialogAck.bind("click", function (e) {
                    e.preventDefault();
                    $("#confirmation_dialog").modal("hide");
                    callback(data);
                });
                confirmationDialog.modal("show");
            } else {
                callback(data);
            }
        };

        self.sendJogCommand = function (axis, multiplier, distance) {
            if (typeof distance === "undefined")
                distance = $('#jog_distance button.active').data('distance');
            if (self.settings.printerProfiles.currentProfileData() && self.settings.printerProfiles.currentProfileData()["axes"] && self.settings.printerProfiles.currentProfileData()["axes"][axis] && self.settings.printerProfiles.currentProfileData()["axes"][axis]["inverted"]()) {
                multiplier *= -1;
            }

            var data = {
                "command": "jog"
            };
            data[axis] = distance * multiplier;

            self.sendPrintHeadCommand(data);
        };

        self.sendHomeCommand1 = function (axis) {
            $("#confirmation_dialog2 .confirmation_dialog_message").html(gettext("The Platform is going to HOME position.<br><strong> WARNING</strong>: Please make sure there is no cured resin below the build platform."));
            $("#confirmation_dialog2 .confirmation_dialog_acknowledge").unbind("click");
            $("#confirmation_dialog2 .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog2").modal("hide");  
                self.sendPrintHeadCommand({
                    "command": "home",
                    "axes": axis
                });
            });
            $("#confirmation_dialog2").modal("show");
        };
        self.sendHomeCommand = function (axis) {
                self.sendPrintHeadCommand({
                    "command": "home",
                    "axes": axis
                });
            
        };
        
        self.sendFeedRateCommand = function () {
            $("#validate_dialog2 .validate_dialog2_message").text(gettext("Please note that at certain speed resonance noise may occur!"));
            $("#validate_dialog2").modal("show");
            self.sendPrintHeadCommand({
                "command": "feedrate",
                "factor": self.feedRate()
            });
        };

        self.sendExtrudeCommand = function () {
            self._sendECommand(1);
        };

        self.sendRetractCommand = function () {
            self._sendECommand(-1);
        };

        self.sendFlowRateCommand = function () {
            self.sendToolCommand({
                "command": "flowrate",
                "factor": self.flowRate()
            });
        };

        self._sendECommand = function (dir) {
            var length = self.extrusionAmount();
            if (!length) length = self.settings.printer_defaultExtrusionLength();

            self.sendToolCommand({
                command: "extrude",
                amount: length * dir
            });
        };

        self.sendSelectToolCommand = function (data) {
            if (!data || !data.key()) return;

            self.sendToolCommand({
                command: "select",
                tool: data.key()
            });
        };
        self.sendPoweron = function () {
            self.sendToolCommand({
                "command": "poweron",
                "factor": self.flowRate()
            });
        };
        self.sendPoweroff = function () {
            self.sendToolCommand({
                "command": "poweroff",
                "factor": self.flowRate()
            });
        };
        self.sendCalibrate = function () {
            self.sendToolCommand({
                "command": "showgrid",
                "factor": self.flowRate()
            });
        };
        self.sendCalibrate1 = function () {
            self.sendToolCommand({
                "command": "showgrid1",
                "factor": self.flowRate()
            });
        };
        
        self.sendCal = function () {
            self.sendHomeCommand(['z']);
            self.sendCustomCommand({type:'commands',commands:['M42 P10 S255']});//Fan on
            self.sendMotor();//up-down-up:wait for 105s
            self.sendCustomCommand({type:'commands',commands:['M106']});//LED on
            
        };
        self.sendCalOff = function () {
            self.sendHomeCommand1(['z']);
            self.sendCustomCommand({type:'commands',commands:['M106 S0']});//Led off
            self.sendCalibrate();//LCD off
            self.sendCustomCommand({type:'commands',commands:['M42 P10 S0']});//Fan off
            
            
        };
        self.sendPrompt = function () {
            self.sendCustomCommand({type:'commands',commands:['M42 P10 S255']});//Fan on
            
        };
        self.sendEconomic = function () {
            self.sendToolCommand({
                "command": "economic",
                "factor": self.flowRate()
            });
        };
        self.sendNormal = function () {
            self.sendToolCommand({
                "command": "normal",
                "factor": self.flowRate()
            });
        };
        self.sendMotor = function () {
            self.sendToolCommand({
                "command": "motor",
                "factor": self.flowRate()
            });
        };
        self.sendPeek = function () {
            self.sendToolCommand({
                "command": "peek",
                "factor": self.flowRate()
            });
        };
        self.sendLcd = function () {
            self.sendToolCommand({
                "command": "lcd",
                "factor": self.flowRate()
            });
        };

        self.sendPrintHeadCommand = function (data) {
            $.ajax({
                url: API_BASEURL + "printer/printhead",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });
        };

        self.sendToolCommand = function (data) {
            $.ajax({
                url: API_BASEURL + "printer/tool",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            });
        };

        self.sendCustomCommand = function (command) {
            if (!command)
                return;

            var data = undefined;
            if (command.hasOwnProperty("command")) {
                // single command
                data = {"command": command.command};
            } else if (command.hasOwnProperty("commands")) {
                // multi command
                data = {"commands": command.commands};
            } else if (command.hasOwnProperty("script")) {
                data = {"script": command.script};
                if (command.hasOwnProperty("context")) {
                    data["context"] = command.context;
                }
            } else {
                return;
            }

            if (command.hasOwnProperty("input")) {
                // parametric command(s)
                data["parameters"] = {};
                _.each(command.input, function(input) {
                    if (!input.hasOwnProperty("parameter") || !input.hasOwnProperty("value")) {
                        return;
                    }

                    data["parameters"][input.parameter] = input.value();
                });
            }

            $.ajax({
                url: API_BASEURL + "printer/command",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify(data)
            })
        };
        self.requestData2 = function() {
            $.ajax({
                url: API_BASEURL + "job",
                method: "GET",
                dataType: "json",
                success: function(data) {
                    self.fromCurrentData(data);
                }
            })
        };

        self.displayMode = function (customControl) {
            if (customControl.hasOwnProperty("children")) {
                return "customControls_containerTemplate";
            } else {
                return "customControls_controlTemplate";
            }
        };

        self.rowCss = function (customControl) {
            var span = "span2";
            var offset = "";
            if (customControl.hasOwnProperty("width")) {
                span = "span" + customControl.width;
            }
            if (customControl.hasOwnProperty("offset")) {
                offset = "offset" + customControl.offset;
            }
            return span + " " + offset;
        };

        self.onStartup = function () {
            self.requestData();
        };

        self.onTabChange = function (current, previous) {
            if (current == "#control") {
            self.requestData2();
                if (self.webcamDisableTimeout != undefined) {
                    clearTimeout(self.webcamDisableTimeout);
                }
                var webcamImage = $("#webcam_image");
                var currentSrc = webcamImage.attr("src");
                if (currentSrc === undefined || currentSrc.trim() == "") {
                    var newSrc = CONFIG_WEBCAM_STREAM;
                    if (CONFIG_WEBCAM_STREAM.lastIndexOf("?") > -1) {
                        newSrc += "&";
                    } else {
                        newSrc += "?";
                    }
                    newSrc += new Date().getTime();

                    webcamImage.attr("src", newSrc);
                }
            } else if (previous == "#control") {
                // only disable webcam stream if tab is out of focus for more than 5s, otherwise we might cause
                // more load by the constant connection creation than by the actual webcam stream
                self.webcamDisableTimeout = setTimeout(function () {
                    $("#webcam_image").attr("src", "");
                }, 5000);
            }
        };

        self.onAllBound = function (allViewModels) {
            var additionalControls = [];
            _.each(allViewModels, function (viewModel) {
                if (viewModel.hasOwnProperty("getAdditionalControls")) {
                    additionalControls = additionalControls.concat(viewModel.getAdditionalControls());
                }
            });
            if (additionalControls.length > 0) {
                self.additionalControls = additionalControls;
                self.rerenderControls();
            }
        };

        self.onFocus = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            self.keycontrolActive(true);
        };

        self.onMouseOver = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            $("#webcam_container").focus();
            self.keycontrolActive(true);
        };

        self.onMouseOut = function (data, event) {
            if (!self.settings.feature_keyboardControl()) return;
            $("#webcam_container").blur();
            self.keycontrolActive(false);
        };

        self.toggleKeycontrolHelp = function () {
            self.keycontrolHelpActive(!self.keycontrolHelpActive());
        };

        self.onKeyDown = function (data, event) {

            switch (event.which) {
                case 121: // number 1
                self.iszenable3(true);
             $("#z_zero3").focus();
                   break;
                case 120: // number 1
                self.iszenable2(true);
             $("#z_zero").focus();
                   break;
                case 119: // number 1
                self.iszenable2(false);
             $("#z_zero").focus();
                self.iszenable3(false);
             $("#z_zero3").focus();
                    break;
                //default:
                    //event.preventDefault();
                    //return false;
            }

        };
        //terminal
        self.displayedLines = ko.computed(function() {
            var regex = self.filterRegex();
            var lineVisible = function(entry) {
                return regex == undefined || !entry.line.match(regex);
            };

            var filtered = false;
            var result = [];
            _.each(self.log(), function(entry) {
                if (lineVisible(entry)) {
                    result.push(entry);
                    filtered = false;
                } else if (!filtered) {
                    result.push(self._toInternalFormat("[...]", "filtered"));
                    filtered = true;
                }
            });

            return result;
        });
        self.displayedLines.subscribe(function() {
            self.updateOutput();
        });

        self.lineCount = ko.computed(function() {
            var total = self.log().length;
            var displayed = _.filter(self.displayedLines(), function(entry) { return entry.type == "line" }).length;
            var filtered = total - displayed;

            if (total == displayed) {
                return _.sprintf(gettext("showing %(displayed)d lines"), {displayed: displayed});
            } else {
                return _.sprintf(gettext("showing %(displayed)d lines (%(filtered)d of %(total)d total lines filtered)"), {displayed: displayed, total: total, filtered: filtered});
            }
        });

        self.autoscrollEnabled.subscribe(function(newValue) {
            if (newValue) {
                self.log(self.log.slice(-self.buffer()));
            }
        });

        self.activeFilters = ko.observableArray([]);
        self.activeFilters.subscribe(function(e) {
            self.updateFilterRegex();
        });
        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
            self._processJobData(data.job);
            self._processCurrentLogData(data.logs);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
            self._processHistoryLogData(data.logs);
        };
        self._processJobData = function(data) {
            self.Ver(data.ver);
        };
        self.VerString = ko.computed(function() {
            return _.sprintf("%s", self.Ver());
        });

        self._processCurrentLogData = function(data) {
            self.log(self.log().concat(_.map(data, function(line) { return self._toInternalFormat(line) })));
            if (self.autoscrollEnabled()) {
                self.log(self.log.slice(-300));
            }
        };

        self._processHistoryLogData = function(data) {
            self.log(_.map(data, function(line) { return self._toInternalFormat(line) }));
        };

        self._toInternalFormat = function(line, type) {
            if (type === undefined) {
                type = "line";
            }
            return {line: line, type: type};
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self.updateFilterRegex = function() {
            var filterRegexStr = self.activeFilters().join("|").trim();
            if (filterRegexStr === "") {
                self.filterRegex(undefined);
            } else {
                self.filterRegex(new RegExp(filterRegexStr));
            }
            self.updateOutput();
        };

        self.updateOutput = function() {
            if (self.autoscrollEnabled()) {
                self.scrollToEnd();
            }
        };

        self.toggleAutoscroll = function() {
            self.autoscrollEnabled(!self.autoscrollEnabled());
        };
        
        self.WiFiSetup = function() {
                $.ajax({
                    url: API_BASEURL + "wifisystem",
                    type: "POST",
                    dataType: "json",
                    data: "action="+self.ssid()+" "+self.password(),
                    success: function() {
                        new PNotify({title: "Success", text: _.sprintf(gettext("The command \"%(command)s\" executed successfully"), {command: "WiFi Setup"}), type: "success"});
                    },
                    error: function(jqXHR, textStatus, errorThrown) {
                        var error = "<p>" + _.sprintf(gettext("The command \"%(command)s\" could not be executed."), {command: "WiFi Set"}) + "</p>";
                        error += pnotifyAdditionalInfo("<pre>" + jqXHR.responseText + "</pre>");
                        new PNotify({title: gettext("Error"), text: error, type: "error", hide: false});
                    }
                });
        };

        self.selectAll = function() {
            var container = $("#terminal-output");
            if (container.length) {
                container.selectText();
            }
        };

        self.scrollToEnd = function() {
            var container = $("#terminal-output");
            if (container.length) {
                container.scrollTop(container[0].scrollHeight - container.height())
            }
        };

        self.sendCommand = function() {
            var command = self.command();
            if (!command) {
                return;
            }

            var re = /^([gmt][0-9]+)(\s.*)?/;
            var commandMatch = command.match(re);
            if (commandMatch !== null) {
                command = commandMatch[1].toUpperCase() + ((commandMatch[2] !== undefined) ? commandMatch[2] : "");
            }

            if (command) {
                $.ajax({
                    url: API_BASEURL + "printer/command",
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json; charset=UTF-8",
                    data: JSON.stringify({"command": command})
                });
        
                self.cmdHistory.push(command);
                self.cmdHistory.slice(-300); // just to set a sane limit to how many manually entered commands will be saved...
                self.cmdHistoryIdx = self.cmdHistory.length;
                self.command("");
            }
        };

        self.handleKeyDown = function(event) {
            var keyCode = event.keyCode;

            if (keyCode == 38 || keyCode == 40) {
                if (keyCode == 38 && self.cmdHistory.length > 0 && self.cmdHistoryIdx > 0) {
                    self.cmdHistoryIdx--;
                } else if (keyCode == 40 && self.cmdHistoryIdx < self.cmdHistory.length - 1) {
                    self.cmdHistoryIdx++;
                }

                if (self.cmdHistoryIdx >= 0 && self.cmdHistoryIdx < self.cmdHistory.length) {
                    self.command(self.cmdHistory[self.cmdHistoryIdx]);
                }

                // prevent the cursor from being moved to the beginning of the input field (this is actually the reason
                // why we do the arrow key handling in the keydown event handler, keyup would be too late already to
                // prevent this from happening, causing a jumpy cursor)
                return false;
            }

            // do not prevent default action
            return true;
        };

        self.handleKeyUp = function(event) {
            if (event.keyCode == 13) {
                self.sendCommand();
            }

            // do not prevent default action
            return true;
        };

        self.onAfterTabChange = function(current, previous) {
            if (current != "#control") {
                return;
            }
            if (self.autoscrollEnabled()) {
                self.scrollToEnd();
            }
        };
        //end--terminal

    }

    OCTOPRINT_VIEWMODELS.push([
        ControlViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        "#control"
    ]);
});
