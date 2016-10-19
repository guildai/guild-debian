/* Copyright 2106 TensorHub, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/********************************************************************
 * Run widget support
 ********************************************************************/

var RUN_UPDATE = "run_update";

var run_support = new function() {

    var runLabel = function(run) {
        var label = "";
        if (run.started) {
            var started = new Date(run.started);
            label += started.toDateString() + ", " + started.toLocaleTimeString();
        }
        if (run.model) {
            if (label) {
                label += " - ";
            }
            label += run.model;
        }
        return label;
    };

    var runStatusUIRules = [
        [["running"],    {label: "Running",    color: "blue-600",  icon: "circle-o-notch", spin: true}],
        [["stopped", 0], {label: "Completed",  color: "green-700", icon: "check-circle-o"}],
        [["stopped"],    {label: "Error",      color: "red-800",   icon: "exclamation-triangle"}],
        [["crashed"],    {label: "Terminated", color: "red-800",   icon: "times-circle"}],
        [[],             {label: "--",         color: "grey-600",  icon: "question-circle-o"}]
    ];

    var runStatusUIAttrs = function(run) {
        for (var i in runStatusUIRules) {
            var rule = runStatusUIRules[i][0];
            var parts = rule.length;
            if ((parts == 0)
                || (parts == 1
                    && rule[0] == run.status)
                || (parts == 2
                    && rule[0] == run.status
                    && rule[1] == run.exit_status))
            {
                return runStatusUIRules[i][1];
            }
        }
        throw "unreachable"; // rules must have catch-all
    };

    this.runLabel = runLabel;
    this.runStatusUIAttrs = runStatusUIAttrs;
};

/********************************************************************
 * Run select
 ********************************************************************/

guild.widget.register("run-select", function(widget, state) {

    var init = function() {
        initWidget();
        guild.data.fetch("/data/runs", update);
    };

    var initWidget = function() {
        widget.on("changed.bs.select", function (e) {
            window.location = "?run=" + $(this).val();
        });
    };

    var update = function(runs) {
        state.run = selectedRun(runs);
        guild.event.notify(RUN_UPDATE, state.run, state);
        refreshWidget(runs);
        if (runStopped()) {
            guild.event.unregisterAll(RUN_UPDATE, state);
        }
        guild.data.scheduleFetch("/data/runs", update, state.refreshInterval);
    };

    var selectedRun = function(runs) {
        var runId = state.run == null ? state.selectedRun : state.run.id;
        return findRun(runId, runs);
    };

    var findRun = function(id, runs) {
        if (id) {
            for (var i in runs) {
                var run = runs[i];
                if (run.id == id) {
                    return run;
                }
            }
        } else {
            if (runs.length > 0) {
                return runs[0];
            }
        }
        return null;
    };

    var refreshWidget = function(runs) {
        var changed = false;
        for (var i = runs.length - 1; i >= 0; i--) {
            var run = runs[i];
            var curOpt = currentOption(run.id);
            var isSelected = state.run && run.id == state.run.id;
            var newOpt = runOption(run, isSelected);
            if (curOpt == null) {
                widget.prepend(newOpt);
                changed = true;
            } else if (optionChanged(curOpt, newOpt)) {
                newOpt.insertBefore(curOpt);
                curOpt.remove();
                changed = true;
            }
        }
        if (changed) {
            widget.selectpicker("refresh");
        }
    };

    var currentOption = function(runId) {
        var option = document.getElementById("run-option-" + runId);
        return option != null ? $(option) : null;
    };

    var runOption = function(run, isSelected) {
        var option = $("<option>");
        var label = run_support.runLabel(run);
        option.append(label);
        option.attr("id", "run-option-" + run.id);
        option.attr("value", run.id);
        option.attr("data-content", optionContent(label, run));
        if (isSelected) {
            option.attr("selected", "");
        }
        return option;
    };

    var optionContent = function(label, run) {
        var uiAttrs = run_support.runStatusUIAttrs(run);
        var iconCls = "fa fa-" + uiAttrs.icon;
        if (uiAttrs.spin) {
            iconCls += " fa-spin";
        }
        return "<span><i class='" + iconCls + "' style='margin-right:10px'></i>"
            + label + "</span>";
    };

    var optionChanged = function(a, b) {
        return a.attr("data-content") != b.attr("data-content");
    };

    var runStopped = function() {
        return state.run && state.run.status != "running";
    };

    init();
});

/********************************************************************
 * Value panel
 ********************************************************************/

guild.widget.register("value-panel", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        guild.data.fetch(guild.widget.runSource(widget, run), update);
    };

    var update = function(data) {
        var value = guild.widget.formattedValue(widget, data);
        if (value != undefined) {
            widget.text(value);
        } else {
            widget.text("--");
        }
    };

    init();
});

/********************************************************************
 * Flags
 ********************************************************************/

guild.widget.register("flags", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        guild.event.unregister(RUN_UPDATE, runUpdated, state);
        guild.data.fetch(guild.util.runSource("/data/flags", run), update);
    };

    var update = function(flags) {
        var split = splitFlags(flags);
        widget.empty();
        if (split.caption) {
            var caption = $("<caption>" + split.caption + "</caption>");
            widget.append(caption);
        }
        for (var name in split.flags) {
            var val = flags[name];
            var row = $("<tr><th scope=\"row\">"+ name + "</th>" +
                        "<td>" + val + "</td></tr>");
            widget.append(row);
        }
    };

    var splitFlags = function(flags) {
        var split = {};
        split.caption = null;
        split.flags = [];
        for (var name in flags) {
            if (name == "description") {
                split.caption = flags[name];
            } else {
                split.flags[name] = flags[name];
            }
        }
        return split;
    };

    init();
});

/********************************************************************
 * Attrs
 ********************************************************************/

guild.widget.register("attrs", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        guild.event.unregister(RUN_UPDATE, runUpdated, state);
        guild.data.fetch(guild.util.runSource("/data/attrs", run), update);
    };

    var update = function(attrs) {
        widget.empty();
        for (var name in attrs) {
            var val = attrs[name];
            var row = $("<tr><th scope=\"row\">"+ name + "</th>" +
                        "<td>" + val + "</td></tr>");
            widget.append(row);
        }
    };

    init();
});

/********************************************************************
 * Status
 ********************************************************************/

guild.widget.register("status", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        var attrs = run ? run_support.runStatusUIAttrs(run) : {};
        if (widget.data("label") != attrs.label ) {
            var icon = statusIcon(attrs.icon, attrs.spin, attrs.color);
            widget.find("i.status-icon").replaceWith(icon);
            widget.find("span.status-label").text(attrs.label);
            widget.data("label", attrs.label);
        }
    };

    var statusIcon = function(icon, spin, color) {
        var iconClass = " fa-" + icon;
        var spinClass = spin ? " fa-spin" : "";
        var colorClass = " mdc-text-" + color;
        return "<i class=\"fa"
            + iconClass
            + spinClass
            + colorClass
            + " status-icon\"></i>";
    };

    init();
});

/********************************************************************
 * Timeseries
 ********************************************************************/

guild.widget.register("timeseries", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        ensureWidgetInit();
        guild.data.fetch(guild.widget.runSource(widget, run), update);
    };

    var ensureWidgetInit = function() {
        if (!widget.attr("initialized")) {
            initWidget();
            widget.attr("initialized", true);
        };
    };

    var initWidget = function() {
        var chart = timeseriesChart();
        initTimeseriesRedrawHandler(chart, widget, state);
        widget.data("chart", chart);
    };

    var timeseriesChart = function() {
        var yLabel = widget.attr("data-widget-label");
        var yFormat = formatFun(widget.attr("data-widget-format"));
        var formatTime = d3.time.format("%H:%M:%S");
        var formatTimeTooltip = d3.time.format("%b %d %H:%M:%S.%L");
        return c3.generate({
            bindto: widget[0],
            data: {
                xs: {},
                columns: []
            },
            size: { height: 320 },
            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        count: 20,
                        format: function(time) {
                            return formatTime(new Date(time));
                        }
                    },
                    label: { text: "Time" }
                },
                y: {
                    label: { text: yLabel },
                    tick: { format: yFormat }
                }
            },
            point: { show: true, r: 1.8 },
            legend: { show: true },
            tooltip: {
                format: {
                    title: function(time) {
                        return formatTimeTooltip(new Date(time));
                    }
                }
            },
            transition: { duration: 0 },
            subchart: {
                show: true,
                size: {
                    height: 30
                }
            }
        });
    };

    var formatFun = function(format) {
        return format ? function(x) {return numeral(x).format(format);} : null;
    };

    var initTimeseriesRedrawHandler = function(chart) {
        var handler = function(panel) {
            var parent = widget.closest(".panel");
            if (parent[0] == panel[0]) {
                if (panel.hasClass("panel-fullscreen")) {
                    chart.resize({height: 640});
                } else {
                    chart.resize({height: 320});
                }
            }
        };
        guild.event.register(guild.view.FULL_SCREEN_TOGGLE, handler, state);
    };

    var update = function(data) {
        var chart = widget.data("chart");
        xs = timeseriesXs(data);
        columns = timeseriesCols(data);
        chart.load({xs: xs, columns: columns});
    };

    var timeseriesXs = function(data) {
        var xs = {};
        for (var name in data) {
            xs[name] = "t:" + name;
        }
        return xs;
    };

    var timeseriesCols = function(data) {
        var cols = [];
        var sortedNames = data != null ? Object.keys(data).sort() : [];
        for (var i in sortedNames) {
            var name = sortedNames[i];
            var series = data[name];
            var times = ["t:" + name];
            var vals = [name];
            cols.push(times);
            cols.push(vals);
            for (var j in series) {
                times.push(series[j][0]);
                vals.push(series[j][2]);
            }
        }
        return cols;
    };


    init();
});


/********************************************************************
 * Output
 ********************************************************************/

guild.widget.register("output", function(widget, state) {

    var init = function() {
        guild.event.register(RUN_UPDATE, runUpdated, state);
    };

    var runUpdated = function(run) {
        ensureWidgetInit();
        guild.data.fetch(guild.util.runSource("/data/output", run), update);
    };

    var ensureWidgetInit = function() {
        if (!widget.attr("initialized")) {
            initWidget();
            widget.attr("initialized", true);
        };
    };

    var initWidget = function() {
        // Setting data on a data table directly fails - something appears
        // to reset the value - so we wrap the table in a div and set data
        // there.
        var formatTime = d3.time.format("%b %d %H:%M:%S.%L");
        var table =
            $("<table class=\"output table table-sm table-hover\" "
              + "width=\"100%\"></table>");
        widget.append(table);
        var dataTable = table.DataTable({
            data: [],
            columns: [
                { title: "Time",
                  data: function(row) {
                      return new Date(row[0]);
                  },
                  render: function(val) {
                      return formatTime(val);
                  },
                  width: "8em"
                },
                { visible: false },
                { title: "Message", orderable: false }
            ],
            scrollY: "360px",
            scrollCollapse: true,
            paging: false,
            deferRender: true,
            language: {
                info: "_TOTAL_ events",
                infoFiltered: " (filtered from _MAX_)",
                infoEmpty: "_TOTAL_ events",
                search: "",
                searchPlaceholder: "Filter",
                zeroRecords: "No matching events"
            },
            dom: "<'row'<'col-sm-12'f>>" +
                "<'row'<'col-sm-12'tr>>" +
                "<'row'<'col-sm-12'i>>",
            rowCallback: function(row, data) {
                if (data[1] == 1) {
                    $(row).addClass("stderr");
                }
            }
        });
        widget.data("dataTable", dataTable);
        widget.data("lastTime", 0);
    };


    var update = function(output) {
        if (!output) return;
        var lastTime = widget.data("lastTime");
        var table = widget.data("dataTable");
        var nextRow = findNextOutputRow(output, lastTime);
        table.rows.add(output.slice(nextRow));
        table.draw("full-hold");
        widget.data("lastTime", lastOutputTime(output));
    };

    var findNextOutputRow = function(output, time) {
        var len = output.length;
        for (var i = 0; i < len; i++) {
            if (output[i][0] > time) {
                return i;
            }
        }
        return len;
    };

    var lastOutputTime = function(output) {
        return (output != null && output.length > 0)
            ? output[output.length - 1][0]
            : 0;
    };

    init();
});

/********************************************************************
 * Compare table
 ********************************************************************/

guild.widget.register("compare-table", function(widget, state) {

    var init = function() {
        initWidget();
        guild.data.fetch(compareSource(), update);
    };

    var initWidget = function() {
        var coldefs = compareTableColdefs(widget);
        var columns = compareTableColumns(coldefs);
        var dataTable = widget.DataTable({
            data: [],
            columns: columns,
            order: [[0, 'desc']],
            scrollY: "360px",
            scrollCollapse: true,
            paging: false,
            deferRender: true,
            language: {
                info: "_TOTAL_ runs",
                infoFiltered: " (filtered from _MAX_)",
                infoEmpty: "_TOTAL_ runs",
                search: "",
                searchPlaceholder: "Filter",
                zeroRecords: "No runs"
            },
            dom: "<'row'<'col-sm-12'f>>" +
                "<'row'<'col-sm-12'tr>>" +
                "<'row'<'col-sm-12'i>>"
        });
        widget.data("dataTable", dataTable);
        widget.data("coldefs", coldefs);
    };

    var compareTableColdefs = function() {
        var coldefsId = widget.attr("data-coldefs");
        var coldefsEl = document.getElementById(coldefsId);
        if (coldefsEl == null) {
            return [];
        }
        var coldefs = [];
        $(".coldef", coldefsEl).each(function() {
            var coldefEl = $(this);
            coldefs.push({
                title: coldefEl.attr("data-title"),
                source: coldefEl.attr("data-source"),
                attribute: coldefEl.attr("data-attribute"),
                reduce: coldefEl.attr("data-reduce"),
                format: coldefEl.attr("data-format")
            });
        });
        return coldefs;
    };

    var compareTableColumns = function(coldefs) {
        var columns = [
            compareTableRunCol(),
            compareTableStatusCol(),
        ];
        for (var i = 0; i < coldefs.length; i++) {
            columns.push(compareTableCol(coldefs[i]));
        }
        return columns;
    };

    var compareTableRunCol = function() {
        return {
            title: "Run",
            orderSequence: ["desc", "asc"],
            render: {
                display: function(run) {
                    return ("<a href=\"/?run=" + run.id + "\">"
                            + run_support.runLabel(run) + "</a>");
                },
                sort: function(run) {
                    return run.started;
                }
            }
        };
    };

    var compareTableStatusCol = function() {
        return {
            orderSequence: ["asc", "desc"],
            title: "Status"
        };
    };

    var compareTableCol = function(coldef) {
        return {
            title: coldef.title,
            orderSequence: ["desc", "asc"],
            render: {
                display: compareTableColRenderer(coldef)
            }
        };
    };

    var compareTableColRenderer = function(coldef) {
        var format = coldef.format;
        return function(val) {
            if (val == null || val == undefined) {
                return "--";
            } else if (format) {
                return guild.util.tryFormat(val, format);
            } else {
                return val;
            }
        };
    };

    var compareSource = function() {
        var coldefs = widget.data("coldefs");
        var sources = coldefs.map(function(coldef) {
            return coldef.source;
        });
        return "/data/compare?sources=" + sources.join();
    };

    var update = function(data) {
        var table = widget.data("dataTable");
        var coldefs = widget.data("coldefs");
        var rows = compareDataRows(data, coldefs);
        table.rows.add(rows);
        table.columns.adjust();
        table.draw();
    };

    var compareDataRows = function(data, coldefs) {
        var rows = [];
        for (var i = 0; i < data.length; i++) {
            var run = data[i].run;
            var row = [run, runStatus(run)];
            rows.push(row);
            for (var j in coldefs) {
                row.push(coldefValue(coldefs[j], data[i]));
            }
        }
        return rows;
    };

    var runStatus = function(run) {
        var attrs = run_support.runStatusUIAttrs(run);
        return attrs.label;
    };

    var coldefValue = function(coldef, data) {
        var raw = data[coldef.source];
        var widgetProxy = coldefWidgetProxy(coldef);
        var val = guild.widget.value(widgetProxy, raw);
        return val != undefined ? val : null;
    };

    var coldefWidgetProxy = function(coldef) {
        // Treat a coldef like a widget for calculating values
        return {
            attr: function(name) {
                if (name == "data-widget-attribute") {
                    return coldef.attribute;
                } else if (name == "data-widget-reduce") {
                    return coldef.reduce;
                } else {
                    return undefined;
                }
            }
        };
    };

    init();
});
