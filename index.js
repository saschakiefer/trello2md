var log4js = require('log4js');
var _ = require('lodash');
var fs = require('fs');
var program = require('commander');

var trelloJson = null;
var trelloObject = null;


/**
 * Converts the Trello JSON export Object to an internal representation
 *
 * @param  {Object} jsonObject JSON object from Trello
 *
 * @return {Object} internal represenatation
 */
var convertJsonToInternalObject = function(jsonObject) {
	logger.debug("Entering convertJsonToInternalObject");

	var intObject = Object;

	_.forEach(jsonObject.lists, function(list) {
		logger.debug("Processing list: " + list.name + " (" + list.id + ")");
		intObject[list.id] = list;

		// Get Cards for List
		intObject[list.id].CARDS = _.filter(jsonObject.cards, ["idList", list.id]);
		logger.debug("   " + intObject[list.id].CARDS.length + " card(s) found");

		// Get Actions and Checklists for Card
		_.forEach(intObject[list.id].CARDS, function(card) {
			logger.debug("      Processing card: " + card.name + " (" + card.id + ")");

			// Actions
			card.ACTIONS = _.filter(jsonObject.actions, function(filterObject) {
				if (filterObject.type == "commentCard" && filterObject.data.card.id == card.id) {
					return true;
				}

				return false;
			});
			logger.debug("         " + card.ACTIONS.length + " action(s) found");

			// Checklists
			card.CHECKLISTS = _.filter(jsonObject.checklists, ["idCard", card.id]);
			logger.debug("         " + card.CHECKLISTS.length + " checklist(s) found");
		});
	});

	return intObject;
};



/**
 * Converts the internal object representation to a markdown file
 *
 * @param  {Array} listArray    Array of the lists from the JSON file to keep the sort order
 * @param  {Object} trelloObject internal Object representation of the source JSON file
 *
 * @return {String}              converted md string
 */
var convertTrelloObjectToMarkdown = function(listArray, trelloObject) {
	logger.debug("Entering convertTrelloObjectToMarkdown");

	var LIST_PREFIX = "# ";
	var CARD_PREFIX = "\n## ";
	var ACTION_PREFIX = "* ";
	var CHECKLIST_PREFIX = "* ";
	var CHECKLIST_ITEM_PREFIX = "\t* ";

	var mdString = "";

	// Loop original list, to keep sort Order
	_.forEach(listArray, function(list) {
		var currentObject = trelloObject[list.id];
		logger.debug("Converting list: " + currentObject.name);

		mdString = mdString + LIST_PREFIX + currentObject.name + "\n";

		// Cards
		_.forEach(currentObject.CARDS, function(card) {

			// Build label string
			var labels = "";

			_.forEach(card.labels, function(label) {
				labels = labels + "\\[" + label.name + "\\] ";

			});

			// Ttle
			mdString = mdString + CARD_PREFIX + card.name + " " + labels + "\n";

			// Description
			if (card.desc !== "") {
				mdString = mdString + card.desc + "\n\n";
			}

			// Actions
			_.reverse(card.ACTIONS);
			_.forEach(card.ACTIONS, function(action) {
				actionDate = new Date(action.date);
				var month = "";
				var day = "";

				// Convert month
				if ((actionDate.getMonth() + 1) < 10) {
					month = month + "0" + (actionDate.getMonth() + 1);
				} else {
					month = month + (actionDate.getMonth() + 1);
				}

				// Convert day
				if (actionDate.getDate() < 10) {
					day = day + "0" + actionDate.getDate();
				} else {
					day = day + actionDate.getDate();
				}

				mdString = mdString + ACTION_PREFIX + "[" + actionDate.getFullYear() + "-" + month + "-" + day + "] " + action.data.text + "\n";
			});

			if (card.ACTIONS.length > 0) {
				mdString = mdString + "\n";
			}

			// Checklist
			if (card.CHECKLISTS.length > 0) {
				// Add empty line if already content available in the sub section
				var prefNL = "";
				if (card.ACTIONS.length > 0) {
					prefNL = "\n";
				}

				_.forEach(card.CHECKLISTS, function(checklist) {
					mdString = mdString + prefNL + CHECKLIST_PREFIX + "Checklist: " + checklist.name + "\n";

					_.forEach(checklist.checkItems, function(item) {
						var checkBox;

						if (item.state == "incomplete") {
							checkBox = "[ ] ";
						} else {
							checkBox = "[X] ";
						}

						mdString = mdString + CHECKLIST_ITEM_PREFIX + checkBox + item.name + "\n";
					});

				});
			}

			// Add extra line to avoid indentation
			if (card.ACTIONS.length === 0 && card.CHECKLISTS.length === 0) {
				mdString = mdString + "\n\n";
			}
		});

		mdString = mdString + "\n";
	});

	return mdString;
};


/**
 * Main converter method:
 *   1. Load and convert the JSON Object to an internal representation
 *   2. Convert the internal representation to the md string
 *
 * @param  {String} jsonFile JSON File name
 *
 * @return {String} md string
 */
var convertJson = function(jsonFile) {
	logger.debug("Entering convertJson");

	try {
		trelloJson = require(jsonFile);
		logger.info("JSON File successfully parsed");
	} catch (e) {
		logger.error("Error opening " + jsonFile);
		logger.error(e);
		process.exit(1);
	}

	logger.info("Board name: " + trelloJson.name + " (" + trelloJson.shortUrl + ")");
	logger.info("Number of lists: " + trelloJson.lists.length);
	logger.info("Number of cards: " + trelloJson.cards.length);
	logger.info("Number of actions: " + trelloJson.actions.length);

	trelloObject = convertJsonToInternalObject(trelloJson);

	return convertTrelloObjectToMarkdown(trelloJson.lists, trelloObject);

};



/**
 * Write the converted md string to output file
 *
 * @param  {String} name Filename
 * @param  {String} data md string
 */
var writeMdFile = function(name, data) {
	// logger.debug(mdString);

	fs.writeFile(name, data, function(err) {
		if (err) {
			return logger.error(err);
		}

		logger.info(name + " successfully created");
	});
};



/**
 * Parse the command line arguments
 */
var parseArguments = function() {
	var error = false;

	program
		.version('0.0.1')
		.option('-s, --source-file [filename]', 'Filename of the Trello JSON export file')
		.option('-o, --output-file [filename]', 'Filename of the markdown export')
		.option('-l, --log-level [level]', 'Set log level [TRACE,DEBUG,INFO,WARN,ERROR,FATAL]. Default: ERROR', 'INFO')
		.parse(process.argv);

	if (!program.sourceFile) {
		logger.error("The JSON source file is missing.");
		error = true;
	}

	if (!program.outputFile) {
		logger.error("The file name for the markdown export is missing.");
		error = true;
	}

	if (error) {
		process.exit(0);
	}

	if (_.includes(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"], program.logLevel)) {
		logger.setLevel(program.logLevel);
		logger.info("Log level: " + program.logLevel);
	} else {
		logger.warn("Invalid log level. Log level set to default value [INFO]");
	}
};



// **************************** MAIN ***************************************************************

// Get logger
var logger = log4js.getLogger("trello2md");
logger.setLevel('INFO');
logger.info("trello2md convert - version 0.0.1");


// check the command line args expecting input json filename and output csv filename
parseArguments();

var mdString = convertJson(program.sourceFile);
writeMdFile(program.outputFile, mdString);