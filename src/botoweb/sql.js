/**
 * JavaScript API to facilitate the construction of SQL queries for use with
 * SQLite via HTML5 Database Storage. Provides an abstraction between the
 * local database and botoweb which allows much more natural use of the data.
 *
 * @author Ian Paterson
 */
botoweb.sql = {
	/**
	 * Builds a SQL query by connecting various components. Tables are joined
	 * implicitly as needed when they are used in filters or columns. The query
	 * can be converted to SQL at any time simply by using it as a string. Most
	 * methods modify the Query in place and also return it to allow chaining.
	 *
	 * @param {[botoweb.sql.Table|botoweb.sql.Column]} columns May be a single
	 * column or table or an array of columns and tables.
	 * @constructor
	 */
	Query: function (columns) {
		var self = this;

		/**
		 * A mixed array of columns and/or tables.
		 * @type {[botoweb.sql.Table|botoweb.sql.Column]}
		 */
		this.columns = [];
		/**
		 * An array of tables that are explicitly or implicitly required in the
		 * query.
		 * @type {[botoweb.sql.Table]}
		 */
		this.tables = [];
		/**
		 * An array of expressions.
		 * @type {[botoweb.sql.Expression]}
		 */
		this.filters = [];
		/**
		 * An array of group by clauses (order is preserved).
		 * @type {[[botoweb.sql.Expression, 'ASC'|'DESC']]}
		 */
		this.groups = [];
		/**
		 * An array of order by clauses (order is preserved).
		 * @type {[[botoweb.sql.Expression, 'ASC'|'DESC']]}
		 */
		this.order = [];
		/**
		 * An array of bound parameters which will be inserted by the query
		 * engine.
		 * @type {[String]}
		 */
		this.bind_params = [];
		/**
		 * If true, selecting a table will automatically join into each related
		 * table for lists and mappings.
		 * @type {Boolean}
		 */
		this.follow_refs = false;

		/**
		 * Adds a new filtering expression which will go to the WHERE clause.
		 *
		 * @param {botoweb.sql.Expression} expr The filter condition.
		 * @return The Query for chaining.
		 */
		this.filter = function (expr) {
			this.filters.push(expr);

			$.each(expr.tables, function(i, t) {
				self._add_table(t);
			});

			$.each(expr.bind_params, function() { self.bind_params.push(this) });

			return this;
		};

		/**
		 * Convenience function to apply botoweb filters related to the given
		 * table to the Query.
		 *
		 * @param {Object|Array} filters Botoweb filters specified in either
		 * implicit = or explicit operator format.
		 * @param {botoweb.sql.Table} tbl The table containing the properties
		 * referenced in the filters.
		 * @return The Query for chaining.
		 */
		this.apply_bw_filters = function (filters, tbl) {
			var query = this;

			// Convert implicit = (hash map) filters to explicit format
			filters = botoweb.ldb.normalize_filters(filters);

			// Convert each filter into a column comparison expression
			$.each(filters, function() {
				if (this[0] in tbl.c)
					query.filter(tbl.c[this[0]].cmp(this[2], this[1]));
			});

			return query;
		};

		/**
		 * Adds a new column or entire table to the SELECT clause. The column's
		 * parent table will be automatically joined into the query. Tables
		 * added here will later be broken into their columns (some columns will
		 * be exluded unless the query follows references).
		 *
		 * @param {botoweb.sql.Column|botoweb.sql.Table} column The column or
		 * entire table to add to the SELECT clause.
		 * @return The Query for chaining.
		 */
		this.append_column = function (column) {
			this.columns.push(column);
			/*
			 * if (column instanceof botoweb.sql.Table)
				this._add_table(column);
			else
				this._add_table(column.table);
			*/

			return this;
		};

		/**
		 * Adds a table to the list of tables that should be joined, unless it
		 * is already in the list.
		 * @param {botoweb.sql.Table} tbl The table to add.
		 */
		this._add_table = function (tbl) {
			if ($.inArray(tbl, this.tables) == -1)
				this.tables.push(tbl);
		};

		/**
		 * Adds an expression to the GROUP BY clause.
		 *
		 * @param {botoweb.sql.Expression} expr A valid GROUP BY expression.
		 * @param {'ASC'|'DESC'} asc_desc The sort order.
		 * @return The Query for chaining.
		 */
		this.group_by = function (expr, asc_desc) {
			this.groups.push([expr, asc_desc]);

			return this;
		};

		/**
		 * Adds an expression to the ORDER BY clause.
		 *
		 * @param {botoweb.sql.Expression} expr A valid ORDER BY expression.
		 * @param {'ASC'|'DESC'} asc_desc The sort order.
		 * @return The Query for chaining.
		 */
		this.order_by = function (expr, asc_desc) {
			this.order.push([expr, asc_desc]);

			return this;
		};

		/**
		 * Executes the query and selects all matching results.
		 *
		 * @param {Transaction} txn A database transaction.
		 * @param {Function} fnc Called when the results are retrieved, gets
		 * (transaction, results) as arguments.
		 */
		this.all = function (txn, fnc) {
			txn.executeSql(this, this.bind_params, fnc);
		};

		/**
		 * Calling this causes the query to follow all reference columns within
		 * selected tables.
		 *
		 * @return The Query for chaining.
		 */
		this.follow_references = function () {
			this.follow_refs = true;

			return this;
		};

		/**
		 * Generates the final SQL query.
		 */
		this.toString = function() {
			var columns = [];

			// Some columns are actually tables, so we need to extract their
			// columns to another array.
			$.each(this.columns, function (i, column) {
				if (column instanceof botoweb.sql.Table) {
					$.each(column.c, function (i, c) {
						if (!c)
							return;

						if (c.table != column) {
							if (!self.follow_refs)
								return;

							self._add_table(c.table);
							self.filter(c.table.c.id.cmp(column.c.id));
						}

						columns.push(c);
					});
				}
				else
					columns.push(column);
			});

			var sql = 'SELECT ' + columns.join(', ');

			if (this.tables.length)
				sql += '\nFROM ' + this.tables.join(', ');

			if (this.filters.length)
				sql += '\nWHERE ' + this.filters.join(' AND ');

			if (this.groups.length)
				sql += '\nGROUP BY ' + $.map(this.groups, function(g) { return g.join(' '); }).join(', ');

			if (this.order.length)
				sql += '\nORDER BY ' + $.map(this.order, function(o) { return o.join(' '); }).join(', ');

			return sql;
		};

		if (!$.isArray(columns)) {
			columns = [columns];
		}

		// Initialize columns passed to the constructor
		$.each(columns, function () {
			self.append_column(this);
		});
	},

	/**
	 * Creates an abstraction of DB tables, which are modified to prevent
	 * conflicts with SQL keywords and are otherwise structurally unsuitable for
	 * easy use via JS. Columns in one table may be mapped internally to a
	 * different table, allowing queries to be built more naturally.
	 *
	 * @param {String} tbl_name The name of the DB table.
	 * @param {[String]} tbl_columns The names of the DB columns.
	 * @param {String} name The internal JS name for the table.
	 * @param {[String]} columns The internal JS names for the columns.
	 * @constructor
	 */
	Table: function (tbl_name, tbl_columns, name, columns) {
		this.name = name || tbl_name;
		this.tbl_name = tbl_name;
		this.c = {};
		this.parent = null;

		// Prevent array indexing errors if columns is undef
		if (!columns)
			columns = {};

		// Always need an id.
		this.c['id'] = new botoweb.sql.Column('id', this);

		for (var c in tbl_columns) {
			this.c[columns[c] || tbl_columns[c]] = new botoweb.sql.Column(tbl_columns[c], this);
		}

		this.set_parent = function (tbl) {
			this.parent = tbl;
			return this;
		};

		/**
		 * Drops the table, use with caution.
		 *
		 * @param {Transaction} txn A database transaction handle.
		 */
		this.__drop = function(txn) {
			txn.executeSql(
				'DROP TABLE ' + this
			);
		}

		/**
		 * @return The DB table name.
		 */
		this.toString = function () {
			return this.tbl_name;
		}
	},

	/**
	 * Represents a column in a table. A single column may be referenced by
	 * multiple botoweb.sql.Table objects, but it must map to only one table
	 * where the column is actually found in the DB.
	 *
	 * @param {String} name The name of the column in the DB.
	 * @param {botoweb.sql.Table} table The table containing the column.
	 * @constructor
	 */
	Column: function (name, table) {
		this.name = name;
		this.table = table;

		/**
		 * Compares the column to another column, expression, or literal.
		 * Special operators starts-with, ends-with, and contains modify the
		 * value to include wildcards (and can therefore only be used with
		 * string values). The default opertator is 'is' which is similar to =.
		 *
		 * @param {botweb.sql.Column|String} val The value we're comparing to.
		 * @param {String} op The operator (any SQL op plus starts-with,
		 * ends-with, and contains).
		 * @return A botoweb.sql.Expression capturing the comparison.
		 */
		this.cmp = function(val, op) {
			op = op || 'is';

			var sql_op = 'like';

			switch (op) {
				case 'contains':
					val = '%' + val + '%';
					break;
				case 'starts-with':
					val = val + '%';
					break;
				case 'ends-with':
					val = '%' + val;
					break;

				// We have chosen to use IS and IS NOT rather than mapping
				// these to the = and != operators. Using this syntax, NULL
				// values will compare equal to one another.
				default:
					sql_op = op;
			}

			return new botoweb.sql.Expression([this, val], function() {
				return this.columns.join(' ' + sql_op + ' ');
			});
		}

		/**
		 * @return a non-conflicting table.column name.
		 */
		this.toString = function() {
			return this.table + '.' + this.name;
		}
	},

	/**
	 * A generic representation of a collection of columns, literals, and other
	 * expressions which keeps track of any tables that it requires as well as
	 * any literal parameters which are bound.
	 *
	 * @param {[botoweb.sql.Column|botoweb.sql.Expression|String]} columns An
	 * array of columns, expressions, or literals which are used in the
	 * expression. How they are used depends on what the Expression was created
	 * to do.
	 * @param {Function} str_func Determines how the expression data will be
	 * converted to SQL. Called in the context of the botoweb.sql.Expression.
	 * @constructor
	 */
	Expression: function (columns, str_fnc) {
		var self = this;
		this.columns = [];
		this.tables = [];
		this.bind_params = [];

		this._add_table = function (tbl) {
			if ($.inArray(tbl, this.tables) == -1)
				this.tables.push(tbl);
		};

		$.each(columns, function(i, c) {
			if (c instanceof botoweb.sql.Expression) {
				self.columns.push(c);
				$.each(c.tables, function() { self._add_table(this); });
				$.each(c.bind_params, function() { self.bind_params.push(this); });
			}
			else if (c instanceof botoweb.sql.Column) {
				self.columns.push(c);
				self._add_table(c.table);
			}
			// Literal
			else {
				self.columns.push('?');
				self.bind_params.push(c);
			}
		});

		/**
		 * Represents the expression as a string in whatever way it is directed
		 * to do so by its maker.
		 */
		this.toString = function() {
			return str_fnc.call(this);
		};
	},

	/**
	 * Combines any number of expressions with OR logic.
	 *
	 * @return A composite botoweb.sql.Expression.
	 */
	or: function () {
		return new botoweb.sql.Expression(arguments, function () {
			return '(' + this.columns.join(' OR ') + ')';
		});
	},

	/**
	 * Combines any number of expressions with AND logic.
	 *
	 * @return A composite botoweb.sql.Expression.
	 */
	and: function () {
		return new botoweb.sql.Expression(arguments, function () {
			return '(' + this.columns.join(' AND ') + ')';
		});
	},

	/**
	 * Creates an expression for any function. First argument is the name of the
	 * function, any other arguments will be passed to the SQL function.
	 *
	 * @param {String} func_str The name of the SQL function.
	 * @return A botoweb.sql.Expression representing the function.
	 */
	func: function(func_str) {
		var args = $.makeArray(arguments);
		args = args.splice(1);
		return new botoweb.sql.Expression(args, function() {
			return func_str + '(' + this.columns.join(',') + ')';
		});
	}
};
