// This is a google app scripts that implements a GTD work flow using
// Google Docs.
//
// Author: Jing Conan Wang
// Email: hbhzwj@gmail.com
//
// This code is under GPL license.

// FIXME need to factor the script.js to several smaller files

/* Verify whether the current document is a GTD document
 * Returns true if the document contains a summary table and the page
 * setting is as expected, and false otherwise.
 */
GTD.isGtdDocument = function() {
    // Verify that the document contains a summary task table
    var tables = GTD.body.getTables();
    if (tables.length === 0 || !GTD.Summary.isTaskSummaryTable(tables[0])) {
        return false;
    }

    // Verify that the margin of the document is okay
    bodyAttr = GTD.body.getAttributes();
    marginLeft = bodyAttr[DocumentApp.Attribute.MARGIN_LEFT];
    marginTop = bodyAttr[DocumentApp.Attribute.MARGIN_TOP];
    marginRight = bodyAttr[DocumentApp.Attribute.MARGIN_RIGHT];
    marginBottom = bodyAttr[DocumentApp.Attribute.MARGIN_BOTTOM];
    if ((marginLeft === GTD.bodyMargins[0]) &&
        (marginTop === GTD.bodyMargins[1]) &&
        (marginRight === GTD.bodyMargins[2]) &&
        (marginBottom === GTD.bodyMargins[3])) {
        return true;
    }
    return false;
};

GTD.initSummaryTable = function() {
    var tables = GTD.body.getTables();
    var taskTable;
    if (tables.length === 0 || !GTD.Summary.isTaskSummaryTable(tables[0])) {
        taskTable = GTD.Summary.createSummaryTable(GTD.body);
    } else {
        taskTable = tables[0];
    }
    GTD.taskTable = taskTable;
};

GTD.initPageMargin = function() {
    this.body.setMarginLeft(this.bodyMargins[0]);
    this.body.setMarginTop(this.bodyMargins[1]);
    this.body.setMarginRight(this.bodyMargins[2]);
    this.body.setMarginBottom(this.bodyMargins[3]);
};

// Change the color of a task according to its current type
GTD.setTaskColor = function(type, task) {
    var taskName = task.taskDesc;
    // setColor = (function (type, ele) {
    //     if (!ele) return;
    //     ele.asText().editAsText().setForegroundColor(this.headerColor[this.TM.getColIdx(type)]);
    // }).bind(this, type);
    // Change the color of the task in the task table
    var timeStamp = GTD.util.getTimeStamp(taskName);
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    // the first element is in the document header table.
    var re = body.findText(timeStamp);
    // setColor(re.getElement());

    // If the task exists in the main body, change its color, too.
    re = body.findText(timeStamp, re);
    if (!re) {
        DocumentApp.getUi().alert('cannot find tash thread table for task: ' + taskName);
        return;
    }

    // setColor(re.getElement());
    // change color of the task header.
    var taskThreadHeader = GTD.Task.getTaskThreadHeader(re.getElement()).header;
    if (!GTD.Task.isValidTaskThreadHeader(taskThreadHeader)) {
        DocumentApp.getUi().alert('find invalid table thread header when changing color of task: ' + taskName);
        return;
    }
    GTD.Task.setThreadHeaderStatus(taskThreadHeader, type);
};

/* Get the task under cursor
 */
GTD.getSelectedTask = function(type) {
    var ret = {};
    var taskHeaderResult = GTD.Task.getTaskThreadHeader();
    var taskHeader = taskHeaderResult.header;
    if (!taskHeader) {
        ret.status = 'NO_TASK_FOUND';
        return ret;
    }
    if (!GTD.Task.isValidTaskThreadHeader(taskHeader)) {
        ret.status = 'INVALID_TASK_THREAD_HEADER';
        return ret;
    }
    var statusBefore = GTD.Task.getThreadHeaderStatus(taskHeader);
    var taskDesc = GTD.Task.getTaskDesc(taskHeader);
    if (!taskDesc) {
        ret.status = 'NO_VALID_TASK_NAME'
        return ret;
    }
    ret.taskDesc = taskDesc;
    ret.threadHeader = taskHeader;
    ret.statusBefore = statusBefore;
    ret.cursorStatus = taskHeaderResult.status;
    ret.status = 'SUCCESS';
    return ret;
};

/**
 * changeTaskStatus
 *
 * @param {object} options.task object
 * @param {string} options.task.taskDesc task description
 * @param {boolean} options.disableGTask indicate whether GTask service
 *     needs to be updated 
 * @param {boolean} options.setTaskColor indicate whether we should
 *     update task color
 * @param {string} options.status {'Actionable'|'Waiting
 *     For'|'Done'|'SomDay'}, a string that represents the status
 */
GTD.changeTaskStatus = function(options) {
    var task = options.task;

    // Update Summary table
    GTD.Summary.cleanTask('All', task);
    GTD.Summary.addTask(options.status, task);
    if (options.setTaskColor) {
        GTD.setTaskColor(options.status, task);
    }

    // Update Task thread header
    GTD.Task.setThreadHeaderStatus(task.threadHeader, options.status);

    // Update gtask service
    if (!options.disableGTask && GTD.gtask.isInitialized()) {
        var tl = GTD.gtask.getActiveTaskList();
        var timestamp = GTD.util.getTimeStamp(task.taskDesc);
        var title = task.taskDesc.replace(timestamp + '\n', '');
        var currentTime = GTD.util.toISO(new Date());
        GTD.gtask.updateTask(tl.taskListId, tl.parentTask, {
            title: title,
            notes: currentTime + ' moved from [' + task.statusBefore + '] to [' + options.status + ']',
            status: options.status,
            keepGTaskNote: true
        });
    }
};

/**
 * Insert task and update information in summary table
 *
 * @param {string} name task name
 * @param {string} status status of task
 * @param {boolean} disableGTask indicate whether gtask service needs to
 *     be updated
 * @returns {object} task object
 */
GTD.insertTask = function(name, status, disableGTask) {
    if (typeof disableGTask === 'undefined') {
        disableGTask = false;
    }
    var task = GTD.Task.createNewTask(name, status);
    // Update task's status in summary table.
    GTD.changeTaskStatus({
        task: task,
        status: status,
        disableGTask: disableGTask
    });

    return task;
};

GTD.insertComment = function() {
    GTD.Task.insertComment();
};

GTD.initialize = function() {
    if (GTD.initialized === true) {
        return;
    }

    // Set background of document to be solarized light color
    var style = {};
    style[DocumentApp.Attribute.BACKGROUND_COLOR] = '#eee8d5';
    var doc = DocumentApp.getActiveDocument().getBody();
    doc.setAttributes(style);

    GTD.initSummaryTable();
    GTD.initPageMargin();
    GTD.initialized = true;
};

GTD.searchBookmarkIdBasedOnTaskDesc = function(taskDesc) {
    var doc = DocumentApp.getActiveDocument();
    var bookmarks = doc.getBookmarks();
    var i, header, desc;
    for (i = 0; i < bookmarks.length; ++i) {
        header = GTD.Task.getTaskThreadHeader(bookmarks[i].getPosition().getElement()).header;
        if (!GTD.Task.isValidTaskThreadHeader(header)) {
            continue;
        }
        desc = GTD.Task.getTaskDesc(header);
        if (taskDesc === desc) {
            return bookmarks[i].getId();
        }
    }
};

/* Get position of thread header for a task
 * Returns Position if the position can be found, and undfined
 * otherwise.
 */
GTD.getTaskThreadPosition = function(task) {
    var doc = DocumentApp.getActiveDocument();
    var documentProperties = PropertiesService.getDocumentProperties();
    var bookmarkId = documentProperties.getProperty(task.taskDesc);
    if (!bookmarkId) {
        Logger.log('PropertiesService unsynced!');
        bookmarkId =  GTD.searchBookmarkIdBasedOnTaskDesc(task.taskDesc);
        if (bookmarkId) {
            documentProperties.setProperty(task.taskDesc, bookmarkId);
        } else {
            return;
        }
    }
    var bookmark = doc.getBookmark(bookmarkId);
    if (bookmark) {
        return bookmark.getPosition();
    }
};

// Find the task header, set the cursor there and select the whole
// header to highlight it.
GTD.jumpAndFocusOnTask = function(task) {
    var doc = DocumentApp.getActiveDocument();
    var taskDesc = task.taskDesc;
    var position = GTD.getTaskThreadPosition(task);
    if (!position) {
        return;
    }

    doc.setCursor(position);

    // Make the task to be selected. This gives user a visual indicator
    // of the start of the task.
    var rangeBuilder = doc.newRange();
    var header = GTD.Task.getTaskThreadHeader(position.getElement()).header;
    rangeBuilder.addElement(header);
    doc.setSelection(rangeBuilder.build());
};

GTD.changeTaskStatusMenuWrapper = function(options) {
    GTD.initialize();
    var statusAfter = options.statusAfter;
    var ret = GTD.getSelectedTask(statusAfter);
    if (ret.status !== 'SUCCESS') {
        DocumentApp.getUi().alert('Cannot find a valid task under cursor. ' +
                                  'Please put cursor in a task in summary table ' +
                                  'or thread header');
        return;
    }

    var comment = 'Move from ' + ret.statusBefore + ' to ' + statusAfter;

    // if cursor is in summary table, display a dialog for comment
    if (ret.cursorStatus === 'cursor_in_summary_table') {
        if (typeof options.comment === 'undefined') {
            var template = GTD.util.templateReplace(GTD.templates.change_task_status, {
                statusAfter: statusAfter,
            });
            var html = HtmlService.createHtmlOutput(template)
                .setSandboxMode(HtmlService.SandboxMode.IFRAME)
                .setWidth(400)
                .setHeight(200);
            DocumentApp.getUi() // Or DocumentApp or FormApp.
                .showModalDialog(html, 'Dialog to change task status');
            return;
        } else {
            comment = comment + '\n' + options.comment;
        }
    }

    GTD.changeTaskStatus({task: ret, status: statusAfter});
    GTD.Task.insertComment({
      threadHeader: ret.threadHeader,
      message: comment,
      location: 'thread'
    });

    // if cursor was in summary table before the change, move the cursor
    // back to the summary table
    if (ret.cursorStatus === 'cursor_in_summary_table') {
        var doc = DocumentApp.getActiveDocument();
        var position = doc.newPosition(GTD.Summary.getSummaryTable(), 0);
        doc.setCursor(position);
    }
};
