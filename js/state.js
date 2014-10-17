/**
 * Grab the state from the simulation model, remove some fields we don't need
 */
function grabState(model) {
    var m = ko.toJS(model);
    // Remove selection lists
    delete m.clients.backoffOptions;
    delete m.results.charts;
    return m;
}

/**
 * Recursive setState
 */
function setState(model, state) {
    for (var k in model) {
        if (ko.isWritableObservable(model[k]) && k in state) {
            model[k](state[k]);
        }
        else if (_.isObject(model[k]) && k in state && _.isObject(state[k]))
            setState(model[k], state[k]);
    }

    if (model.postUnpickle) model.postUnpickle();
}

/**
 * Serialize the given object to the hash string
 */
function pushState(obj) {
    if (window.history.replaceState) {
        var encoded = btoa(JSON.stringify(grabState(obj)));
        window.history.replaceState(null, null, '#' + encoded);
    }
}

function subscribeAll(obj, fn) {
    for (var k in obj) {
        if (ko.isObservable(obj[k])) 
            obj[k].subscribe(fn);
        else if (_.isObject(obj[k]))
            subscribeAll(obj[k], fn);
    }
}

function loadState(simu, s) {
    var obj = JSON.parse(atob(s));
    setState(simu, obj);
}

