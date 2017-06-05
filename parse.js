'use strict';

var {parserlib} = require('./parserlib');

var CssToProperty = {'url': 'urls', 'url-prefix': 'urlPrefixes', 'domain': 'domains', 'regexp': 'regexps'};

Object.defineProperty(Array.prototype, 'last', {
  get: function () {
    return this[this.length - 1];
  }}
);

function fromMozillaFormat(content, onSection, onError, onDone) {
  function backtrackTo(parser, tokenType, startEnd) {
    var tokens = parser._tokenStream._lt;
    for (var i = tokens.length - 2; i >= 0; --i) {
      if (tokens[i].type === tokenType) {
        return {line: tokens[i][startEnd + 'Line'], col: tokens[i][startEnd + 'Col']};
      }
    }
  }
  function trimNewLines(s) {
    return s.replace(/^[\s\n]+/, '').replace(/[\s\n]+$/, '');
  }
  // do onetime housekeeping as the imported text is confirmed to be a valid style
  function initFirstSection(section) {
    // skip adding the first global section when there's no code/comments
    if (!section.code.replace('@namespace url(http://www.w3.org/1999/xhtml);', '') /* ignore boilerplate NS */
        .replace(/[\s\n]/g, '')) { /* ignore all whitespace including new lines */
      return false;
    }
    return true;
  }

  var mozStyle = trimNewLines(content);
  var parser = new parserlib.css.Parser(), lines = mozStyle.split('\n');
  var sectionStack = [{
    code: '',
    start: {line: 1, col: 1},
  }];
  var errors = '';
  var firstAddedCM;

  function getRange (start, end) {
    const L1 = start.line - 1, C1 = start.col - 1;
    const L2 = end.line - 1, C2 = end.col - 1;
    if (L1 === L2) {
      return lines[L1].substr(C1, C2 - C1 + 1);
    } else {
      const middle = lines.slice(L1 + 1, L2).join('\n');
      return lines[L1].substr(C1) + '\n' + middle +
        (L2 >= lines.length ? '' : ((middle ? '\n' : '') + lines[L2].substring(0, C2)));
    }
  }
  function doAddSection(section) {
    section.code = section.code.trim();
    // don't add empty sections
    if (!section.code && !section.urls && !section.urlPrefixes && !section.domains && !section.regexps) {
      return;
    }
    if (!firstAddedCM) {
      if (!initFirstSection(section)) {
        return;
      }
    }
    onSection(null, section);
    firstAddedCM = firstAddedCM || true;
  }

  parser.addListener('startdocument', function (e) {
    var outerText = getRange(sectionStack.last.start, (--e.col, e));
    var gapComment = outerText.match(/(\/\*[\s\S]*?\*\/)[\s\n]*$/);
    var section = {code: '', start: backtrackTo(this, parserlib.css.Tokens.LBRACE, 'end')};
    // move last comment before @-moz-document inside the section
    if (gapComment && !gapComment[1].match(/\/\*\s*AGENT_SHEET\s*\*\//)) {
      section.code = gapComment[1] + '\n';
      outerText = trimNewLines(outerText.substring(0, gapComment.index));
    }
    if (outerText.trim()) {
      sectionStack.last.code = outerText;
      doAddSection(sectionStack.last);
      sectionStack.last.code = '';
    }
    e.functions.forEach(function (f) {
      var m = f.match(/^(url|url-prefix|domain|regexp)\((['"]?)(.+?)\2?\)$/);
      var aType = CssToProperty[m[1]];
      var aValue = aType !== 'regexps' ? m[3] : m[3].replace(/\\\\/g, '\\');
      (section[aType] = section[aType] || []).push(aValue);
    });
    sectionStack.push(section);
  });

  parser.addListener('enddocument', function () {
    var end = backtrackTo(this, parserlib.css.Tokens.RBRACE, 'start');
    var section = sectionStack.pop();
    section.code += getRange(section.start, end);
    sectionStack.last.start = (++end.col, end);
    doAddSection(section);
  });

  parser.addListener('endstylesheet', function () {
    // add nonclosed outer sections (either broken or the last global one)
    var endOfText = {line: lines.length, col: lines.last.length + 1};
    sectionStack.last.code += getRange(sectionStack.last.start, endOfText);
    sectionStack.forEach(doAddSection);

    onDone();
  });

  parser.addListener('error', onError);
  parser.parse(mozStyle);
}

exports.fromMozillaFormat = fromMozillaFormat;
