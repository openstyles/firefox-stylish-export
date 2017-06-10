'use strict';

var {Cc, Ci, Cu} = require('chrome');
var {Downloads} = Cu.import('resource://gre/modules/Downloads.jsm');
var {OS} = Cu.import('resource://gre/modules/osfile.jsm');
var notifications = require('sdk/notifications');

Cu.importGlobalProperties(['Blob']);
Cu.importGlobalProperties(['URL']);

var service;
try {
  service = Cc['@userstyles.org/style;1'].getService(Ci.stylishStyle);
}
catch (e) {
  notifications.notify({
    title: 'Stylish export to JSON',
    text: 'Stylish add-on is not installed or is not enabled. To extract styles make sure Stylish add-on is enabled, then reload this extension.'
  });
}
var styles = service.list(service.REGISTER_STYLE_ON_CHANGE, {}).map(s => {
  // changing update URL to chrome version
  if (s.updateUrl) {
    const id = /\d+/.exec(s.updateUrl);
    if (id && id.length) {
      let args = '';
      if (s.updateUrl.indexOf('?') !== -1) {
        args = s.updateUrl.split('?').pop();
      }
      s.updateUrl = `https://userstyles.org/styles/chrome/${id[0]}.json` + (args ? '?' + args : '');
    }
  }
  return {
    enabled: s.enabled,
    id: s.id,
    md5Url: s.md5Url,
    originalMd5: s.originalMd5,
    name: s.name,
    updateUrl: s.updateUrl,
    url: s.url,
    code: s.code
  };
});

function prepare (style) {
  let sections = [];
  return new Promise((resolve) => {
    const onSection = (e, section) => sections.push(section);
    const onError = () => {};
    const onDone = () => {
      delete style.code;
      sections = sections.filter(s => s.code).map(s => {
        delete s.start;
        s = Object.assign({
          domains: [],
          regexps: [],
          urlPrefixes: [],
          urls: []
        }, s);
        return s;
      });
      resolve(Object.assign(style, {sections}));
    };
    try {
      require('./parse').fromMozillaFormat(style.code, onSection, onError, onDone);
    }
    catch (e) {
      console.error(style.name, e.message);
      resolve();
    }
  });
}

Promise.all(styles.map(prepare)).then(styles => {
  styles = styles.filter(s => s);
  const path = OS.Path.join(OS.Constants.Path.desktopDir, 'stylish.json');
  Downloads.fetch(
    URL.createObjectURL(new Blob([JSON.stringify(styles, null, '\t')], {
      type: 'text/plain;charset=utf-8;'
    })),
    path
  ).then(() => {
    notifications.notify({
      title: 'Stylish export to JSON',
      text: `Exported ${styles.length} styles to "${path}"`
    });
  });
});
