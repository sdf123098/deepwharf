// Host half of the DeepWharf companion plugin.
//
// Everything user-visible happens in the browser half (lib/client.js): this
// entry exists only so the cordis loader mounts the package, which is what
// puts it into the web boot graph and serves its client bundle. No services
// are consumed or provided on the host side.

exports.apply = function apply() {};

exports.inject = [];
