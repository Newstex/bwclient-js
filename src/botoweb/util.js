/**
 * Library of helper functions.
 *
 * @author Ian Paterson
 */

(function ($) {

var $util = botoweb.util;

/**
 * Returns a properly formatted ISO 8601 timestamp string.
 *
 * @param {Date|String} d A JavaScript Date or a string in mm/dd/yyyy hh:mm:ss am
 * format, defaults to current date and time.
 */
$util.timestamp = function (d) {
	if (!d)
		d = new Date();
	else if (typeof d == 'string') {
		//           mm     dd     yyyy     hh    mm       ss     am|pm
		var data = /(\d+)\/(\d+)\/(\d+)(?: (\d+):(\d+)(?::(\d+))? (..))?/.exec(d);

		// String to number (except am|pm)
		for (var i in data) {
			if (i < 7)
				data[i] = (data[i] || 0) * 1;
		}

		// Adjust month to zero-based
		data[1] -= 1;

		// Adjust hours
		if (data[4] == 12)
			data[4] = 0;

		if (data[7] && data[7].toUpperCase() == 'PM')
			data[4] += 12;

		d = new Date(data[3], data[1], data[2], data[4] || 0, data[5] || 0, data[6] || 0);
	}

	var timestamp = d.getUTCFullYear() + '-0' + (d.getUTCMonth() + 1) + '-0' + d.getUTCDate() + 'T0';

	// Special case, if the time is exactly midnight, leave it as
	// exactly midnight in GMT. This signifies that the time is not
	// important.
	if (!d.getHours() && !d.getMinutes() && !d.getSeconds())
		timestamp += '00:00:00';
	else
		timestamp += d.getUTCHours() + ':0' + d.getUTCMinutes() + ':0' + d.getUTCSeconds();

	// We added extra zeroes to ensure full two-digit dates, if there
	// are three digits in any space, remove the leading zero.
	return timestamp.replace(/([T:-])0(\d\d)/g, '$1$2');
};

/**
 * Returns a nicely formatted date string in the user's current time zone. If
 * the time component is 00:00:00, the date string will not include the time.
 *
 * @param {String} ts An ISO 8601 timestamp string.
 */
$util.from_timestamp = function (ts, format) {
	var date_time = ts;
	var has_time = true;
	if(typeof(ts) == 'string'){
		var t = ts.match(/(\d+)-(\d+)-(\d+)(?:T(\d+):(\d+):(\d+))?/);

		if (!t || t.length < 7)
			return

		// String to number
		for (var i in t)
			t[i] *= 1;

		// If the time is exactly midnight, assume that this is a date with unspecified time
		has_time = (t[4] || t[5] || t[6]);

		if (has_time)
			date_time = new Date(Date.UTC(t[1],t[2] - 1,t[3],t[4],t[5],t[6]));

		// We use NOON if there is no time because this prevents seeing a different
		// date after TZ conversion, as would happen if we used MIDNIGHT.
		else
			date_time = new Date(Date.UTC(t[1],t[2] - 1,t[3], 12, 0, 0));
	}


	var time_str;

	if (format) {
		time_str = $.datepicker.formatDate(format, date_time);
	}
	else {
		time_str = '0' + (date_time.getMonth() + 1) + '/0' +
			date_time.getDate() + '/' + date_time.getFullYear();

		if (has_time) {
			time_str += ' 0' + (date_time.getHours() % 12 || 12) + ':0' + date_time.getMinutes() + ' ' +
				((date_time.getHours() < 12 || date_time.getHours() == 0) ? 'AM' : 'PM');
		}

		time_str = time_str.replace(/(^|[ \/:])0(\d\d)/g, '$1$2');
	}

	return time_str;
};

/**
 * Joins any number of URL parts into a single URL. Preserves leading and
 * trailing slashes on the first and last items, respectively.
 */
$util.url_join = function () {
	return $.map(arguments, function (part, i) {
		if (!part)
			return null;

		if (i > 0)
			part = part.replace(/^\/+/g, '');

		if (i < arguments.length - 1)
			part = part.replace(/\/+$/g, '');

		return escape(part).replace('%3A//', '://');
	}).join('/');
};

/**
 * Interpolates variables offset in strings by {{ var_name }} notation.
 *
 * @param {String} str The string containing interpolation markup.
 * @param {Object} data The data available for interpolation.
 * @return The interpolated string.
 */
$util.interpolate = function (str, data) {
	if (!str) return str;
	if (!data) data = {};

	var replacement = '';

	data.__user__ = botoweb.env.user;
	data.__obj__ = botoweb.ui.page.obj || {};

	if (data instanceof botoweb.Object) {
		replacement = function (m, key) {
			if (key in data.data)
				return data.data[key].to_sql() || '';

			eval('ret = data.' + key);

			return ret || data[key] || '';
		};
	}
	else {
		if (data.meta_recent) {
			// Consider "recent" as anything within the past 10 days.
			var d = new Date().valueOf() - 1000 * 60 * 60 * 24 * 10;
			data.timestamp_recent = $util.timestamp(new Date(d));
		}

		replacement = function (m, key) {
			var ret;
			eval('ret = data.' + key);
			return ret || '';
		};
	}
	
	if (replacement && typeof replacement == 'string')
		replacement = replacement.replace(/\\/g, "\\").replace(/(['"])/g, "\\$1");

	return str.replace(/\{\{\s*(.*?)\s*\}\}/g, replacement);
};

/**
 * Returns the string with all HTML entities replaced with their
 * corresponding characters. This will convert entities such as &lt; as
 * well as &#39;
 *
 * @param {String} str The string to unescape.
 * @return The unescaped string.
 */
$util.html_unescape = function (str) {
	if (str)
		return $('<div/>').html(str || '').text();

	return '';
};

/**
 * Escapes any HTML in the given text and restores whitespace formatting with
 * br tags and HTML nonbreaking space entities.
 *
 * @param {String} str The string to format.
 * @return An HTML string suitable for safe insertion with $(...).html()
 */
$util.html_format = function (str) {
	if (!str)
		return '';

	return str.toString().replace(/[<>\n\t]|  /g, function (chr) {
		switch (chr) {
			case '>':	return '&gt;';
			case '<':	return '&lt;';
			case '\n':	return '<br />';
			case '  ':	return ' &nbsp;';
			case '\t':	return '&nbsp;&nbsp; &nbsp;';
		}
	})
}

/**
 * Performs transformations according to predefined or user-defined
 * formatting functions.
 */
$util.format = function (format, value, opt) {
	opt = opt || {};
	/()/.test('');
	format = format.replace(/\((.*?)\)/, '');

	var params = RegExp.$1;
	var prefix = '';

	var formatter = $util.formats[format];

	if (!formatter) {
		console.warn('Formatter for ' + format + ' does not exist. Please add it to botoweb.util.formats');
		return value;
	}

	if (opt.node) {
		var n = $(opt.node);
		n.addClass('format-' + format);

		// Use the original value for sorting
		if (n.html().indexOf('bwSortHint') < 0) {
			prefix = $util.sortable_string(value);
		}
	}

	// Remove non-numeric characters
	if (formatter.type == 'number') {
		var tmpval = parseFloat(('' + value).replace(/<.*?>|[^0-9.-]/g, ''));

		if (isNaN(tmpval)) {
			console.error('Value cannot be formatted as a number: ', value);
			return;
		}

		value = tmpval;
	}

	var formatted = '' + formatter.fnc(value, params);

	if (formatter.type == 'number') {
		// Insert commas according to US number formatting
		if (opt.commas) {
			formatted = formatted.replace(/(\d+)(\.|\D|$)/, function (x, int_part, suffix) {
				do {
					/()/.test(''); // reset RegExp
					int_part = int_part.replace(/(\d)(\d{3})(,|$)/, '$1,$2');
				} while (RegExp.$1);

				 return int_part + suffix;
			});
		}
	}

	return prefix + formatted;
};

$util.formats = {
	'dollar': {
		type: 'number',
		fnc: function(value, precision) { return '$' + value.toFixed(parseInt(precision || 2)); }
	},

	'percent': {
		type: 'number',
		fnc: function(value, precision) { return value.toFixed(parseInt(precision || 0)) + "%"; }
	},

	'float': {
		type: 'number',
		fnc: function(value, precision) { return value.toFixed(parseInt(precision || 2)); }
	},

	'floor': {
		type: 'number',
		fnc: Math.floor
	},

	'round': {
		type: 'number',
		fnc: Math.round
	},

	'uppercase': {
		type: 'string',
		fnc: function (value) { return value.toUpperCase(); }
	},

	'lowercase': {
		type: 'string',
		fnc: function (value) { return value.toLowerCase(); }
	},

	'html_whitespace': {
		type: 'string',
		fnc: function (value) {
			return value.replace(/\t/g, '&nbsp; &nbsp;&nbsp;')
				.replace(/  /g, ' &nbsp;')
				.replace(/\r?\n/g, '<br />');
		}
	},

	"icon": {
		type: "string",
		fnc: function(text){
			return '<img title="' + text + '" src="' + bwIconPath + text.replace("icon://","") + bwIconExt + '"/>';
		}
	}
};

// Aliases
$util.formats.int = $util.formats.floor;

/**
 * Converts certain special characters to their normal ascii equivalents.
 *
 * @param {String} str The string to normalize.
 */
$util.normalize_string = function (str) {
	if (!str) return '';

	$.each({
		curly_quote: '"',
		curly_apostrophe: "'",
		dash: '-',
		ellipse: '...',
		bad_whitespace: ' ',
		linefeed: '\n'
	}, function (type, replacement) {
		str = str.replace($util.re[type], replacement);
	});

	str = str.replace($util.re.non_ascii, function (m) { return '&#' + m.charCodeAt(0) + ';' });

	return str;
};

$util.sort_props = function(a,b) {
	if (a.meta)
		return (a.meta.label || a.meta.name || a).toString().toLowerCase() > (b.meta.label || b.meta.name || b).toString().toLowerCase() ? 1 : -1;

	return (a.name || a).toString().toLowerCase() > (b.name || b).toString().toLowerCase() ? 1 : -1;
};

$util.sortable_string = function (str) {
	if (!str)
		str = '';
	else
		str = '' + str;

	// Remove non sortable characters, any leading spaces, and any duplicated spaces
	return '<span class="hidden" title="bwSortHint ' + str.toLowerCase().replace($util.re.non_sortable, '').replace(/^ +/, '').replace(/ {2,}/, ' ') + '"></span>';
};

$util.uuid = function () {
	return Math.uuidFast().toLowerCase();
};

/**
 * Some RegExps which are used enough to warrant being cached.
 */
$util.re = {
	curly_quote: /[“”]/g,
	curly_apostrophe: /[‘’]/g,
	dash: /[‒–—―]/g,
	ellipse: /…/g,
	bad_whitespace: /[\t\v]+/g,
	linefeed: /\r?\n|\r\n?/g,

	non_sortable: /[^\w\s\d.-]+|\b(the|a|an)\s+/g,

	// See ascii table, all characters between Space and ~ are good, other
	// characters must be converted to HTML entities. \n and \t are the only
	// characters below Space which may be valid input (assuming CR is converted
	// to LF)
	non_ascii: /([^\n\t -~])/g
};

/**
 * Get User Param
 */
$util.gup = function(name){
	name = name.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]");
	var regexS = "[\\?&]"+name+"=([^&#]*)";
	var regex = new RegExp( regexS );
	var results = regex.exec( window.location.href );
	if( results == null )
		return "";
	else
		return results[1];
};

})(jQuery);

