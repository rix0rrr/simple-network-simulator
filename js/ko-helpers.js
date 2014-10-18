'use strict';
/* global ko */

ko.extenders.numeric = function(target) {
    //create a writable computed observable to intercept writes to our observable
    var result = ko.pureComputed({
        read: target,  //always return the original observables value
        write: function(newValue) {
            var current = target(),
                newValueAsNum = isNaN(newValue) ? 0 : parseFloat(+newValue);
 
            //only write if it changed
            if (newValueAsNum !== current) {
                target(newValueAsNum);
            } 
        }
    }).extend({ notify: 'always' });
 
    return result;
};
