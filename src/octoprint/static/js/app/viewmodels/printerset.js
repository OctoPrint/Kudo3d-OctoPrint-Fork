/* jshint undef: true, unused: true */

$(function() {
    function PrintersetViewModel(parameters) {
        var self = this;
        
    
        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.printerProfiles = parameters[2];
        self.quickOptions = ko.observableArray(["Quick Start","1st CSV","2st CSV","3st CSV","4st CSV"]);
        self.quickselected = ko.observable(undefined);

        self.blayer= ko.observable(undefined);
        self.xpx= ko.observable(undefined);
        self.layert= ko.observable(undefined);
        self.ypx= ko.observable(undefined);
        self.prox= ko.observable(undefined);
        self.shutter= ko.observable(undefined);
        self.mask= ko.observable(undefined);
        self.offx= ko.observable(undefined);
        self.offy= ko.observable(undefined);
        self.extruder= ko.observable(undefined);
        self.bed= ko.observable(undefined);
        //self.nres= ko.observable(undefined);
        
        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.nres = ko.computed(function () {
            var projectNative = 0;
            projectNative = Math.floor(self.prox()/self.xpx()*1000);
            return projectNative;
        });
        self.filename = ko.observable(undefined);
        self.confilename = ko.observable(undefined);
        self.savename = ko.observable(undefined);
        self.totallayers = ko.observable(undefined);
        self.currentlayer = ko.observable(undefined);
        self.pflag = ko.observable(1);
        self.csvflag = ko.observable(undefined);
        self.imagename = ko.observable(undefined);
        self.progress = ko.observable(undefined);
        self.filesize = ko.observable(undefined);
        self.filepos = ko.observable(undefined);
        self.printTime = ko.observable(undefined);
        self.printTimeLeft = ko.observable(undefined);
        self.sd = ko.observable(undefined);
        self.timelapse = ko.observable(undefined);
        self.flowRate = ko.observable(100);

        self.busyFiles = ko.observableArray([]);

        self.filament = ko.observableArray([]);
        self.estimatedPrintTime = ko.observable(undefined);
        self.lastPrintTime = ko.observable(undefined);

        self.currentHeight = ko.observable(undefined);
        self.TITLE_PRINT_BUTTON_PAUSED = gettext("Restarts the print job from the beginning");
        self.TITLE_PRINT_BUTTON_UNPAUSED = gettext("Starts the print job");
        self.TITLE_PAUSE_BUTTON_PAUSED = gettext("Resumes the print job");
        self.TITLE_PAUSE_BUTTON_UNPAUSED = gettext("Pauses the print job");

        self.titlePrintButton = ko.observable(self.TITLE_PRINT_BUTTON_UNPAUSED);
        self.titlePauseButton = ko.observable(self.TITLE_PAUSE_BUTTON_UNPAUSED);

        self.previousIsOperational = undefined;
        self.spec = ko.observableArray([{fromlay:1, tolay:1, expos:0.5, lift:3.0, ups:15.0 , downs:100.0 ,delay:0.5 }]);
        
        self.heightString = ko.computed(function() {
            if (!self.currentHeight())
                return "0mm";
            return _.sprintf("%.03fmm", self.currentHeight());
        });
        
        self.addSpec = function() {
            self.spec.push({fromlay:1, tolay:parseInt(self.totallayers()), expos:7, lift:3.0, ups:15.0 , downs:150 ,delay:0.5 });
        };
        
        var connectionTab = $("#advance");
        connectionTab.collapse("hide");
            
       $("#filename").change(function(e) {
        var ext = $("input#filename").val().split(".").pop().toLowerCase();
        
        if($.inArray(ext, ["csv"]) == -1) {
        alert('Upload CSV');
        return false;
        }
            
        if (e.target.files != undefined) {
        var reader = new FileReader();
        reader.onload = function(e) {
        var csvval=e.target.result.split("\n");
        var csvvalue1 = [];
        var csvvalue2 = csvval[1].split(",");
        csvvalue2[0] = csvvalue2[0].replace("\r","");
        self.layert(csvvalue2[0]);
        self.spec.removeAll();
        for(var j=4;j<csvval.length-1;j++)
        {
        var csvvalue=csvval[j].split(",");
        /*csvvalue[3] = csvvalue[3].replace(".0","")
        csvvalue[4] = csvvalue[4].replace(".0","")
        csvvalue[5] = csvvalue[5].replace(".0","")*/
        csvvalue[4] = csvvalue[4].replace("\r","");
         self.spec.push({fromlay:csvvalue[0], tolay:csvvalue[1], expos:csvvalue[2], lift:csvvalue[3], ups:csvvalue[4] });
        }
        };
        reader.readAsText(e.target.files.item(0));
        
        }
        
        return false;
        
        });
 

    function convertArrayOfObjectsToCSV(args) {
        var result, ctr, keys, keys1, columnDelimiter, lineDelimiter, data;

        data = args.data || null;
        if (data == null || !data.length) {
            return null;
        }
        columnDelimiter = args.columnDelimiter || ',';
        lineDelimiter = args.lineDelimiter || '\n';

        keys = Object.keys(data[0]);
        keys[0] = 'fromlay';
        keys[1] = 'tolay';
        keys[2] = 'expos';
        keys[3] = 'lift';
        keys[4] = 'ups';
        keys[5] = 'downs';
        keys[6] = 'delay';
        
        result = '########## Slice Thickness (mm) ##########,\n';
        result = result + self.layert() + ',';
        result += lineDelimiter;
        result = result + '########## Basic Configurations ##########,,,,,,,\n';
        result += keys.join(columnDelimiter);
        result += lineDelimiter;

        data.forEach(function(item) {
            ctr = 0;
            keys.forEach(function(key) {
                if (ctr > 0) result += columnDelimiter;

                result += item[key];
                ctr++;
            });
            result += lineDelimiter;
        });

        return result;
    }
    function convertArrayOfObjects1(args) {
        var data;
        var runflag = 1;
        var toLayer = 0;
        var len = 0;
        var item;
        var printmode = $('#jog_mode button.active').data('distance');
        data = args.data || null;
        if (data === null || !data.length) { //mod
            return null;
        }
        len = data.length;
        if (self.totallayers() <= 0) {
            $("#validate_dialog .validate_dialog_message").text(gettext("Error: No Model Please Load Model"));
            $("#validate_dialog").modal("show");
            runflag = 0;
            return runflag;
        }

        if (printmode == 100){
            for(var j=0;j<len;j++)
            {
             item = data[j];
                    if (isNaN(parseFloat(item.fromlay)) === true ) { //mod
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Form layer is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.fromlay) <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Form layer <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (self.totallayers() > 0 &&(parseFloat(item.fromlay) > self.totallayers())) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: From layer "+ String(item.fromlay) + " > total Layer "+String(self.totallayers())));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (toLayer != (parseFloat(item.fromlay) -1)) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: discontinuous layer designation! from ="+String(item.fromlay)+"  to ="+String(toLayer)));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseFloat(item.tolay)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: To layer is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    toLayer = parseFloat(item.tolay);
                    if (toLayer <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: To layer <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (self.totallayers() > 0 &&(toLayer > self.totallayers())) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: To layer "+String(toLayer)+" > total Layer "+String(self.totallayers())));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseInt(item.tolay)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: To layer is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseFloat(item.expos)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Exp.Time is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.expos) <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Exp.Time <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    /*if (parseFloat(item['expos']) < 1.0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Exp.Time Must >= 1.0"));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }*/
                    if (isNaN(parseFloat(item.lift)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Lift Height is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.lift) < 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Lift Height < 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseFloat(item.ups)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Lift Speed is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.ups) <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Lift Speed <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.ups) > 400) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Lift Speed > 400."));  /*100*/
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseFloat(item.downs)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Down Speed is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.downs) <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Down Speed <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.downs) > 400) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Down Speed > 400.")); /*150*/
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (isNaN(parseFloat(item.delay)) === true) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Delay Time is blank."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
                    if (parseFloat(item.delay) <= 0) {
                        $("#validate_dialog .validate_dialog_message").text(gettext("Error: Delay Time <= 0."));
                        $("#validate_dialog").modal("show");
                        runflag = 0;
                        return runflag;
                    }
            }
        }
        return runflag;
    }

    window.downloadCSV = function(args) {
        var data, filename, link ;
    var outputspec = [];
    ko.utils.arrayForEach(self.spec(), function(i) {
      outputspec.push(i);
    });

        var csv = convertArrayOfObjectsToCSV({
            data: outputspec
         });
        if (csv === null) return;

        /*filename = args.filename || 'export.csv';*/
        filename = self.savename() || 'cvsfile.csv';
        if (filename.indexOf(" ") >= 0) {
            $("#validate_dialog .validate_dialog_message").text(gettext("Error: Filename can not include space"));
            $("#validate_dialog").modal("show");
            return ;
        }

        /*if (!csv.match(/^data:text\/csv/i)) {
            csv = 'data:text/csv;charset=utf-8,' + csv;
        }
        data = encodeURI(csv);*/
        var data1 = {
            "command": "save",
            "filename": self.savename(),
            "content": csv
        };
        $.ajax({
            url: API_BASEURL + "printerset2",
            type: "POST",
            dataType: "json",
            contentType: "application/json; charset=UTF-8",
            data: JSON.stringify(data1),
        });

        /*link = document.createElement('a');
        link.setAttribute('href', data);
        link.setAttribute('download', filename);
        link.click();*/
    }
        self.pauseString = ko.computed(function() {
            if (self.isPaused())
                return gettext("Continue");
            else
                return gettext("Pause");
        });

        self.removeSpec = function(profile) {
            self.spec.remove(profile);
        };

        self.requestData = function() {
            $.ajax({
                url: API_BASEURL + "printerset",
                method: "GET",
                dataType: "json",
                success: function(response) {
                    self.fromResponse(response);
                }
            });
        };

        self.fromResponse = function(response) {
            var blayer= response.current.blayer;
            var xpx= response.current.xpx;
            var layert= response.current.layert;
            var ypx= response.current.ypx;
            var prox= response.current.prox;
            var offx= response.current.offx;
            var offy= response.current.offy;
            var spec= response.current.spec;
            var shutter= response.current.shutter;
            var mask= response.current.mask;
            self.blayer(blayer);
            self.xpx(xpx);
            self.layert(layert);
            self.ypx(ypx);
            self.prox(prox);
            self.offx(offx);
            self.offy(offy);
            self.spec(spec);
            self.shutter(shutter);
            self.mask(mask);
            self.savename('cvsfile.csv');
        };
        self.requestData1 = function() {
            $.ajax({
                url: API_BASEURL + "printerset1",
                method: "GET",
                dataType: "json",
                success: function(response) {
                    self.fromResponse1(response);
                }
            });
        };
        self.requestData2 = function() {
            $.ajax({
                url: API_BASEURL + "job",
                method: "GET",
                dataType: "json",
                success: function(data) {
                    self.fromCurrentData(data);
                }
            });
        };

        self.fromResponse1 = function(response) {
            var layert= response.current.layert;
            var spec= response.current.spec;
            self.layert(layert);
            self.spec(spec);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
        };

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
            self._processJobData(data.job);
       };

        self._processStateData = function(data) {
            var prevPaused = self.isPaused();
            self.previousIsOperational = self.isOperational();

            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
            if (self.isPaused() != prevPaused) {
                if (self.isPaused()) {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_UNPAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_PAUSED);
                } else {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_UNPAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_UNPAUSED);
                }
            }

        };
        self._processJobData = function(data) {
            if (data.file) {
                self.filename(data.file.name);
                self.confilename(data.file.conname);
                self.filesize(data.file.size);
                self.sd(data.file.origin == "sdcard");
                self.totallayers(data.file.layers);
                self.currentlayer(data.file.currentlayer);
             } else {
                self.filename(undefined);
                self.confilename(undefined);
                self.filesize(undefined);
                self.sd(undefined);
            }

            self.estimatedPrintTime(data.estimatedPrintTime);
            self.lastPrintTime(data.lastPrintTime);
            self.pflag(data.pflag);
            self.csvflag(data.csvflag);
            self.imagename(data.imagename);
            var img = document.getElementById('image');
            img.className = "rotate90";
            if (self.imagename() === null){
                $("#image").attr("src", "static/img/Blank_1440x2560.png");
               
            } else {
                $("#image").attr("src", "static/image/"+self.imagename());
                
            }
            var result = [];
            if (data.filament && typeof(data.filament) == "object" && _.keys(data.filament).length > 0) {
                for (var key in data.filament) {
                    if (!_.startsWith(key, "tool") || !data.filament[key] || !data.filament[key].hasOwnProperty("length") || data.filament[key].length <= 0) continue;

                    result.push({
                        name: ko.observable(gettext("Tool") + " " + key.substr("tool".length)),
                        data: ko.observable(data.filament[key])
                    });
                }
            }
            self.filament(result);
            if (self.csvflag() == 1){
             self.requestData1();
            
             }
       };
      
        self.print1 = function() {
            var restartCommand = function() {
                self._jobCommand("restart");
            };

            if (self.isPaused()) {
                $("#confirmation_dialog .confirmation_dialog_message").text(gettext("This will restart the print job from the beginning."));
                $("#confirmation_dialog .confirmation_dialog_acknowledge").unbind("click");
                $("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog").modal("hide"); restartCommand(); });
                $("#confirmation_dialog").modal("show");
            } else {
                self._jobCommand("start");
            }

        };

        self.pause = function() {
            self._jobCommand("pause");
        };
        self.peek = function() {
            self._jobCommand("peek");
        };

        self.cancel = function() {
            self._jobCommand("cancel");
        };

        self._jobCommand = function(command, callback) {
            $.ajax({
                url: API_BASEURL + "job",
                type: "POST",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                data: JSON.stringify({command: command}),
                success: function(response) {
                    if (command == "pause"){
                    self.requestData2();    
                    }
                    if (callback !== undefined) {
                        callback();
                    }
                }
            });
        };
        self._fromData = function(data) {
            self._processZData(data.currentZ);
        };
        
        self._processZData = function(data) {
            self.currentHeight(data);
        };
        
        self.print = function() {
            $("#confirmation_dialog .confirmation_dialog_message").html(gettext("Start Printing. "));
            $("#confirmation_dialog .confirmation_dialog_acknowledge").unbind("click");
            //$("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog").modal("hide"); self.print11(); });
            $("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog").modal("hide"); self.print11(); });
            $("#confirmation_dialog").modal("show");
                
        };
        
        self.print11 = function() {
        var printmode = $('#jog_mode button.active').data('distance');
                var data = {
                    "command": "save",
                    "blayer": self.blayer(),
                    "xpx": self.xpx(),
                    "layert": self.layert(),
                    "ypx": self.ypx(),
                    "prox": self.prox(),
                    "offx": self.offx(),
                    "offy": self.offy(),
                    "nres": self.nres(),
                    "spec": self.spec(),
                    "shutter": self.shutter(),
                    "mask": self.mask(),
                    "printmode": printmode
                };
                var runflag = 1;
                var data;
                var outputspec = [];
                ko.utils.arrayForEach(self.spec(), function(i) {
                  outputspec.push(i);
                });
            
                runflag = convertArrayOfObjects1({
                    data: outputspec
                 });

                if (self.layert() <= 0) {
                    $("#validate_dialog .validate_dialog_message").text(gettext("Slice Thickness <= 0."));
                    $("#validate_dialog").modal("show");
                    runflag = 0;
                }
                if(runflag == 1){
                $.ajax({
                    url: API_BASEURL + "printerset",
                    type: "POST",
                    dataType: "json",
                    contentType: "application/json; charset=UTF-8",
                    data: JSON.stringify(data),
                    success: function(response) {
                        self.print1();
                    }
                });
                
                }
        };
        self.send50mm = function () {
            self.sendPrintHeadCommand({
                "command": "50mm",
                "axes": "z"
            });
        };
        
        self.sendHomeCommand = function (axis) {
            self.sendPrintHeadCommand({
                "command": "home",
                "axes": axis
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

        self.onStartup = function () {
            self.requestData();
        };
        self.prmode = function () {
        var connectionTab = $("#advance");
        var printmode = $('#jog_mode button.active').data('distance');
        if(printmode == 10)
        {
        
            connectionTab.collapse("hide");
            
        }
        if(printmode == 100)
        {
            connectionTab.collapse("show");
            
        }
        };
        
        self.sendTestMode = function () {
            self.layert(15);
            self.spec.removeAll();
            self.spec.push({fromlay:1, tolay:10, expos:1, lift:15.5, ups:150 , downs:150 ,delay:0.5 });
            
        };
        self.lockAdvSetting = function () {
            $('#advance').find('input, textarea, button, select').attr('disabled',true);
            $("#material :button").attr("disabled", false);
            if (self.filename() == "TEST.zip"){
                self.layert(0.05);
                self.spec.removeAll();
                self.spec.push({fromlay:1, tolay:parseInt(self.totallayers()), expos:5, lift:3, ups:25 , downs:100.0 ,delay:0.5 });
            }                
        };
        
        self.showAdvSetting = function () {
            $('#advance').find('input, textarea, button, select').attr('disabled',false);
            $("#material :button").attr("disabled", true);
            
        };
        self.sendWBG_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:10, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:10, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:9, lift:3, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };
        self.sendENH_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:12, lift:3, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };
        self.sendENT_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:15, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:10, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:10, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };
        
        self.sendCast_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:7, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.025);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:70, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:55, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:20, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:7, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:4, lift:3, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };
        self.sendClear_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:50, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:50, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:40, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:50, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:40, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:30, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:50, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:40, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:30, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:20, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:90, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:70, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:60, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:50, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:40, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:30, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:20, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:16, lift:3, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };
        self.sendFlexible_parameter = function () {
            if (isNaN(parseInt(self.totallayers())) === true) {
                $("#validate_dialog .validate_dialog_message").text(gettext("Please load zip file"));
                $("#validate_dialog").modal("show");
            }
            else{
                if ((parseInt(self.totallayers())) == 1) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 5) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:parseInt(self.totallayers()), expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 10) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:parseInt(self.totallayers()), expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 20) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:parseInt(self.totallayers()), expos:35, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 30) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:35, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:parseInt(self.totallayers()), expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 40) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:35, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:parseInt(self.totallayers()), expos:25, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else if ((parseInt(self.totallayers())) <= 50) {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:35, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:25, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:parseInt(self.totallayers()), expos:20, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                else {
                    self.layert(0.05);
                    self.spec.removeAll();
                    self.spec.push({fromlay:1, tolay:1, expos:50, lift:7, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:2, tolay:5, expos:45, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:6, tolay:10, expos:40, lift:6, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:11, tolay:20, expos:35, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:21, tolay:30, expos:30, lift:5, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:31, tolay:40, expos:25, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:41, tolay:50, expos:20, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                    self.spec.push({fromlay:51, tolay:parseInt(self.totallayers()), expos:12, lift:4, ups:15.0 , downs:150.0 ,delay:0.5 });
                }
                
                $('#advance').find('input, textarea, button, select').attr('disabled',true);
                $("#material :button").attr("disabled", false);
            }
        };

    }
    
    OCTOPRINT_VIEWMODELS.push([
        PrintersetViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        "#temp"
    ]);
});
