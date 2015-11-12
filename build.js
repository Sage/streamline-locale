"use strict";
var fsp = require('path');
var compile = require('streamline-helpers').compileSync;

compile(fsp.join(__dirname, 'test'), fsp.join(__dirname, 'test-callbacks'), 'callbacks');
