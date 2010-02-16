/**
 * JavaScript API for use with botoweb with integrated local storage for
 * enhanced data access and querying performance.
 *
 * @author Chris Moyer
 * @author Ian Paterson
 */
var botoweb = {
	env: {},

	//
	// Get all items at this url
	//
	all: function(url, obj_name, fnc){
		return botoweb.find(url, null, obj_name, fnc);
	},

	//
	// Find items at this URL using optional filters
	// @param url: The URL to search at
	// @param filters: The Filters to apply (or null for none), this should be of the form {name: value, name2: value2}
	// @param fnc: The function to call back to
	//
	find: function(url, filters, obj_name, fnc){
		// Apply the filters
		url += "?";
		for (filter in filters){
			url += filter + "=" + filters[filter] + "&";
		}

		var page = 0;
		var process = function(xml, xhr){
			var data = [];
			$(xml).find(obj_name).each(function(){
				var obj = botoweb.parseObject(this);
				if(obj.length > 0){
					data.push(obj);
				}
			});
			url = $(xml).find('link[rel=next]').attr('href');

			var count;

			if (xhr && typeof xhr.getResponseHeader == 'function')
				count = xhr.getResponseHeader('X-Result-Count');

			// Get the next page
			if (fnc(data, page++, count) && url)
				botoweb.ajax.get(url, process);
		}

		return botoweb.ajax.get(url, process);
	},

	//
	// Advanced query searching
	// @param url: The URL to search at
	// @param query: The Query to use, this must be an array of tuples [name, op, value]
	// 		if "value" is a list, this is treated as an "or" and results in ["name" op "value" or "name" op "value"]
	// 		"op" must be one of the following: (=|>=|<=|!=|<|>|starts-with|ends-with|like)
	// @param fnc: The callback function
	//
	query: function(url, query, obj_name, fnc){
		// Build the query string
		parts = [];
		for (query_num in query){
			query_part = query[query_num];
			name = query_part[0];
			op = query_part[1];
			value = query_part[2];

			if(value.constructor.toString().indexOf("Array") != -1){
				parts.push('["' + name + '","' + op + '",["' + value.join('","') + '"]]');
			} else {
				parts.push('["' + name + '","' + op + '","' + value + '"]');
			}
		}

		url += "?query=[" + escape(parts.join(",") + "]");

		var page = 0;
		var process = function(xml, xhr){
			var data = [];
			$(xml).find(obj_name).each(function(){
				var obj = botoweb.parseObject(this);
				if(obj.length > 0){
					data.push(obj);
				}
			});
			url = $(xml).find('link[rel=next]').attr('href');

			var count;

			if (xhr && typeof xhr.getResponseHeader == 'function')
				count = xhr.getResponseHeader('X-Result-Count');

			// Get the next page
			if (fnc(data, page++, count) && url)
				botoweb.ajax.get(url, process);
		}

		return botoweb.ajax.get(url, process);
	},

	//
	// Function: parseObject
	// Parse this XML into an object
	//
	parseObject: function(data){
		var obj = {};
		obj.length = 0;
		obj.id = $(data).attr('id');
		obj.model = data.tagName;

		$(data).children().each(function(){
			var value = null;
			if($(this).attr("type") in {reference:1,blob:1}){
				value = {
					name: this.tagName,
					type: $(this).attr("type"),
					href: $(this).attr("href"),
					id: $(this).attr("id"),
					item_type: $(this).attr('item_type')
				};
			}
			else if($(this).children().length){
				value = [];
				$(this).children().each(function() {
					value.push({
						name: $(this).attr('name'),
						type: $(this).attr('type'),
						value: $(this).text()
					});
				});
			}
			else {
				value = $(this).text();
			}
			if (obj[this.tagName]) {
				if (!$.isArray(obj[this.tagName]))
					obj[this.tagName] = [obj[this.tagName]];
				obj[this.tagName].push(value);
			}
			else {
				obj[this.tagName] = value;
			}
			obj.length++;
		});
		return obj;
	},

	//
	// Function: get_by_id
	// Find a specific object by ID
	//
	get_by_id: function(url, id, fnc){
		botoweb.ajax.get(url + "/" + id, function(data){
			$(data).children().each(function(){
				var curobj = botoweb.parseObject(this);
				if(curobj.length > 0){
					fnc(curobj);
				}
			});
		});
	},

	//
	// Functon: save
	// Save this ticket, or create a new one
	// the Data string is a simple class mapping
	// which is then converted into the proper XML document
	// to be sent to the server
	//
	save: function(url, obj_name, data, method, fnc){
		var doc = document.implementation.createDocument("", obj_name, null);
		var obj = doc.documentElement;
		for(pname in data){
			var pval = data[pname];

			if (pval == undefined)
				continue;

			if (!(pname in botoweb.env.models[obj_name].prop_map)) {
				continue;
			}

			var type = botoweb.env.models[obj_name].prop_map[pname]._type;

			var list = true;

			if(pval.constructor.toString().indexOf("Array") == -1){
				pval = [pval];
				list = false;
			}

			// Force entire complexType to be encoded at once
			if (type == 'complexType')
				pval = [pval];
			else
				type = botoweb.env.models[obj_name].prop_map[pname]._item_type || type;

			$(pval).each(function() {
				if (list && this == '')
					return;

				var prop = doc.createElement(pname);

				// Modifies prop in place
				botoweb.encode_prop(this, prop, type);

				$(prop).attr("type", type);
				/*
				if(this.constructor.toString().indexOf("Array") != -1){
					$(prop).attr("type", "List");
				} else if (this.constructor.toString().indexOf("Class") != -1){
					$(prop).attr("type", "Reference");
				}
				else if (/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(this)){
					$(prop).attr("type", "dateTime");
				}
				else {
					$(prop).attr("type", "string");
				}
				*/
				obj.appendChild(prop);
			});
		}

		//DEBUG
		//alert(url + "\n\n" + (new XMLSerializer()).serializeToString(doc));
		//fnc({status: 201, getResponseHeader: function() { return '123' ;}});
		//return

		opts = {
			url: url,
			processData: false,
			data: doc
		}
		if(method){
			opts.type = method;
		} else {
			opts.type = "PUT";
		}

		if(fnc){
			opts.complete = fnc;
		}
		$.ajax(opts);
	},

	/**
	 * Simple Initialization script which handles the everyday setup that
	 * most of our apps will have to do. We make available the environment
	 * object in botoweb.env
	 *
	 * @param {String} href The location of the API root
	 */
	init: function(href, opt) {
		if (!opt) opt = {};

		new botoweb.Environment(href, function(env) {
			botoweb.env = env;

			botoweb.ldb.name = opt.db.name;
			botoweb.ldb.title = opt.db.title;
			botoweb.ldb.size_mb = opt.db.size_mb;
			botoweb.ldb.version = env.version;

			// Prepare the database according to the environment settings
			botoweb.ldb.prepare(function (db) {
				botoweb.ui.init();
				botoweb.ldb.sync.update();

				// Update the local database every 2 minutes
				setInterval(botoweb.ldb.sync.update, 2 * 60 * 1000);
			}, function (e) {
				alert('You are not using a WebKit enabled browser (Safari or Google Chrome). Performance enhancements will be disabled for this session.\n\n' + e.message);
				botoweb.ui.init();
			});
		}, opt);
	},

	sample_init: function (opt) {
		if (!opt) opt = {};

		// TODO re-integrate actual API loading code.
		botoweb.env = {
			version: '0.1',

			models: {Names:{name:'Names',properties:[{name:'name', _type: 'string'}]}}
		};

		botoweb.ldb.name = opt.db.name;
		botoweb.ldb.title = opt.db.title;
		botoweb.ldb.size_mb = opt.db.size_mb;
		botoweb.ldb.version = botoweb.env.version;

		botoweb.ldb.prepare(function (db) {
			var table = botoweb.ldb.tables.Names;
			var query = new botoweb.sql.Query(table)
				.filter(botoweb.sql.or(table.c.name.cmp('John'), table.c.name.cmp('J', 'starts-with')))

			alert('SQL:\n' + query + '\n\nBound parameters:\n' + query.bind_params);
		}, function (e) {
			alert('error ' + e.message);
		});
	}
};