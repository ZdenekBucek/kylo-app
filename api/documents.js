'use strict';
const {neon} = require('@neondatabase/serverless');
const handleDocuments = require('../lib/documents');

module.exports = (req, res) => handleDocuments(req, res, neon(process.env.DATABASE_URL));
