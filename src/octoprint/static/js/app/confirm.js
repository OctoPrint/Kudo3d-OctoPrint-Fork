(function() {
    var originalInit = ko.bindingHandlers.click.init;
    ko.bindingHandlers.click = {
        conditions: [
            {locator: "event.target.id=='printer_connect'", test: "this.isOperational()"}, // disconnect when connected
            {locator: "event.target.classList.contains('icon-trash')", test: "true"}, // trash icon always
            {locator: "event.target.id=='job_cancel'", test: "true"}, // job cancel always
        ],
        init: function(element, valueAccessor, allBindingsAccessor, viewModel) {
            var wrappedValueAccessor = function() {
                return function(data, event) {
                   ko.bindingHandlers.click.preOnClick.call(viewModel, data, event, function() {valueAccessor().call(viewModel, data, event);});
                };
            };
            originalInit(element, wrappedValueAccessor, allBindingsAccessor, viewModel);
        },
        preOnClick: function(data, event, handler) {
            // See if we can find a rule
            var condition = ko.bindingHandlers.click.conditions.filter(function(x) {
                return eval(x.locator);
            });
            // If we found a rule see if it is in effect, if not just proceed
            var test = condition[0] ? condition[0].test : false;
            if (!eval(test)) {
                handler();
                return;
            }
            $("#confirmation_dialog .confirmation_dialog_message").text(gettext(event.target.innerText || event.target.title) + "?");
            $("#confirmation_dialog .confirmation_dialog_acknowledge").unbind("click");
            $("#confirmation_dialog .confirmation_dialog_acknowledge").click(function(e) {e.preventDefault(); $("#confirmation_dialog").modal("hide"); handler(); });
            $("#confirmation_dialog").modal("show");
        }
    };
})();
