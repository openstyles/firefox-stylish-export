'use strict';

var {Cc, Ci, Cu} = require('chrome');
var {Downloads} = Cu.import('resource://gre/modules/Downloads.jsm');
var {OS} = Cu.import('resource://gre/modules/osfile.jsm');
var notifications = require('sdk/notifications');

Cu.importGlobalProperties(['Blob']);
Cu.importGlobalProperties(['URL']);

var service = Cc['@userstyles.org/style;1'].getService(Ci.stylishStyle);
var styles = service.list(service.REGISTER_STYLE_ON_CHANGE, {}).map(s => ({
  enabled: s.enabled,
  id: s.id,
  md5Url: s.md5Url,
  originalMd5: s.originalMd5,
  name: s.name,
  updateUrl: s.updateUrl,
  url: s.url,
  code: s.code,
}));

function prepare (style) {
  let sections = [];
  return new Promise((resolve) => {
    const onSection = (e, section) => sections.push(section);
    const onError = (e) => {};
    const onDone = () => {
      delete style.code;
      sections = sections.filter(s => s.code).map(s => {
        delete s.start;
        return Object.assign({
          domains: [],
          regexps: [],
          urlPrefixes: [],
          urls: []
        }, s);
      });
      resolve(Object.assign(style, {sections}));
    }
    require('./parse').fromMozillaFormat(style.code, onSection, onError, onDone);
  });
}

Promise.all(styles.map(prepare)).then(styles => {
  const path = OS.Path.join(OS.Constants.Path.desktopDir, 'stylish.json')
  Downloads.fetch(
    URL.createObjectURL(new Blob([JSON.stringify(styles)], {
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
