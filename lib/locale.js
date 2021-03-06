"use strict";

var globals = require('streamline-runtime').globals;
var cache = {};
var locale = exports;

/// * `loc = locale.current;`
///   returns the current locale, as a string ('en', 'en-US', 'fr-FR', etc.)
Object.defineProperty(locale, 'current', {
	get: function() {
		return (globals.context && globals.context.locale) || 'en-US';
	},
	set: function(val) {
		throw new Error("locale.current is readonly. Use locale.setLocale(_, value) to change it.");
	}
});

Object.defineProperty(locale, 'isRTL', {
	get: function() {
		var lang = locale.current.substring(0, 2);
		return lang === "ar" || lang === "iw";
	},
});

Object.defineProperty(locale, 'preferences', {
	get: function() {
		return globals.context && globals.context.localePreferences;
	},
});

/// * `locale.setCurrent(_, value)`
///   Changes the current locale
///   This is an asynchronous call because we need to fetch the resources again on client side.
locale.setCurrent = function(cb, value, localePreferences) {
	if (!globals.context) return cb(new Error("cannot call locale.setCurrent without a global context"));
	globals.context.locale = value;
	globals.context.localePreferences = localePreferences;
	if (typeof require.localize === "function") require.localize(value, cb);
	else cb();
};

function _loadResources(mod, l) {
	function _loadFile(l, result) {
		if (!mod.filename) console.error(mod);
		var p = mod.filename.replace(/\\/g, '/'),
			slash = p.lastIndexOf('/'),
			dir = p.substring(0, slash) + '/resources',
			base = p.substring(slash + 1);
		base = base.substring(0, base.lastIndexOf('.'));
		var fs_ = 'fs',
			fs = require(fs_),
			path_ = 'path',
			path = require(path_);
		if (!fs.existsSync(dir)) return result || {};
		p = dir + '/' + base + '-' + l + '.json';
		var exists = fs.existsSync(p);
		if (!exists && l.length === 2) {
			var re = new RegExp('^' + base + '-' + l + '-\\w+\\.json$');
			var first = fs.readdirSync(dir).filter(function(s) {
				return re.test(s);
			})[0];
			if (first) {
				p = dir + "/" + first;
				exists = true;
			}
		}
		if (exists) {
			var delta = JSON.parse(fs.readFileSync(p, 'utf8'));
			if (!result) return delta;
			Object.keys(delta).forEach(function(k) {
				result[k] = delta[k];
			});
		}
		return result || {};

	}
	var r = _loadFile('en');
	var k = l.substring(0, 2);
	if (k !== 'en') r = _loadFile(k, r);
	if (l !== k) r = _loadFile(l, r);
	return r;
}

// hack to add resources when serving modules to clients
locale.getResourcesHook = function(cb, filename, accept) {
	var l = (accept || 'en-US').split(',')[0];
	if (l.length > 3) l = l.substring(0, 3) + l.substring(3).toUpperCase();
	var r = locale.resources({
		filename: filename
	}, l)();
	cb(null, JSON.stringify(r));
};

/// * `resources = locale.resources(mod, l)`
///   Returns a loader function for localized resources.
///   Resource `foo` is loaded with `resources().foo`
///   Warning: Returns a function. Do not forget the parentheses!
locale.resources = function(mod, l) {
	return function() {
		// client-side hack - don't support l arg for now
		if (mod.__resources) return mod.__resources;
		var cur = l || locale.current;
		var key = mod.filename + '-' + cur,
			r = cache[key];
		if (!r) r = cache[key] = _loadResources(mod, cur);
		return r;
	};
};

function _format(fmt, args) {
	return fmt.split('{{').map(function(fmt) {
		return fmt.split(/\}\}(?=(?:\}\})*[^\}]|$)/).map(function(fmt) {
			return fmt.replace(/\{([^}]+)\}/g, function(dummy, pat) {
				var sep = pat.indexOf(':');
				if (sep < 0) sep = pat.indexOf('?');
				var ref = sep < 0 ? pat : pat.substring(0, sep);
				var i = parseInt(ref, 10);
				var val = i >= 0 ? args[i] : (args[0] && args[0][ref]);
				switch (pat[sep]) {
					case ':':
						// TODO: apply numeric pattern
						return val;
					case '?':
						var strings = pat.substring(sep + 1).split('|');
						return strings[Math.min(val, strings.length - 1)];
					default:
						return val;
				}
			});
		}).join('}');
	}).join('{');
}

locale.format = function(mod, key) {
	var fmt, args;
	if (typeof mod === 'string') {
		fmt = mod, args = Array.prototype.slice.call(arguments, 1);
	} else {
		fmt = locale.resources(mod)()[key];
		if (fmt == null) throw new Error('resource ' + key + ' not found');
		args = Array.prototype.slice.call(arguments, 2);
	}
	return _format(fmt, args);
};

locale.formatLocale = function(loc, mod, key) {
	var fmt, args;
	if (typeof mod === 'string') {
		fmt = mod, args = Array.prototype.slice.call(arguments, 2);
	} else {
		fmt = locale.resources(mod, loc)()[key];
		if (fmt == null) throw new Error('resource ' + key + ' not found');
		args = Array.prototype.slice.call(arguments, 3);
	}
	return _format(fmt, args);
};

var longMap = {
	ar: "ar-sa", // Arabe Standard
	cz: "cz-cz", // Czech
	de: "de-de", // German
	//	en: "en-au", // English  Australia
	//	en: "en-gb", // English - British
	//	en: "en-ph", // Filipino
	en: "en-us", // English - American
	es: "es-es", // Spanish
	//	fr: "fr-ca", // French-Canada
	fr: "fr-fr", // French
	it: "it-it", // Italian
	pl: "pl-pl", // Polish
	pt: "pt-pt", // Portuguese
	ru: "ru-ru", // Russian
	zh: "zh-cn", // Chinese
	//	zh: "zh-tw", // Chinese tranditional
};

locale.formatAllIso = function(mod, key) {
	// to prevent pre commit rules
	var all = {
		"default": _format(locale.resources(mod, locale.current)()[key])
	};
	Object.keys(longMap).forEach(function(lang) {
		var res = _format(locale.resources(mod, lang)()[key]);
		if (lang === "en" || (lang !== "en" && res !== all.default)) all[longMap[lang]] = res;
	});
	return all;
};

locale.extractLocaleCode = function(acceptLanguageHeader) {
	// for now just take the first; TODO: take the best really supported from the list
	var a = (acceptLanguageHeader || "").split(",")[0];
	a = a.split(";");
	var res = a[0];
	// prefer long format: Can be dangerous a better way would be to have mapping between short format and a long one.
	a.forEach(function(l) {
		if (l.indexOf("-") >= 0) res = l;
	});
	return res;
};

locale.longIso = function(isocode) {
	return (/\w\w-\w\w/i).exec(isocode) && isocode.toLowerCase() || longMap[isocode && isocode.toLowerCase()];
};
