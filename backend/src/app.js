const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const routes = require('./routes');

// TODO: Add CSRF protection, see GH Issue #170. Ignore for now.
// eslint-disable-next-line max-len
// nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage.express-check-csurf-middleware-usage
/**
 * Creates an instance of the Express application.
 *
 * @return {Object} - The Express application instance.
 */
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(routes);

module.exports = app;
