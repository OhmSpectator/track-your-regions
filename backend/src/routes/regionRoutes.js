const express = require('express');
const { check, query, validationResult } = require('express-validator');
const regionController = require('../controllers/regionController');
const { getDataTypeRange } = require('../utils/dataTypes');
const { Hierarchy, Region } = require('../models');

const router = express.Router();

router.get(
  '/hierarchies',
  async (req, res) => {
    await regionController.getHierarchies(req, res);
  },
);
router.get(
  '/root',
  ...[
    check('hierarchyId').optional().isInt(
      { min: 0, max: getDataTypeRange(Hierarchy, 'hierarchyId').max },
    ).withMessage('Hierarchy ID must be valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getRootRegions(req, res);
  },
);

router.get(
  '/search',
  /**
   * Search regions based on query and hierarchy ID.
   *
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object.
   */
  [
    query('query').isString().withMessage('Query must be a string'),
    query('hierarchyId').optional().isInt(
      { min: 0, max: getDataTypeRange(Hierarchy, 'hierarchyId').max },
    ).withMessage('Hierarchy ID must be a valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.searchRegions(req, res);
  },
);

router.get(
  '/:regionId',
  /**
   * Get region by ID.
   *
   * @param {Object} req - The request object.
   * @param {Object} res - The response object.
   * @returns {Object} The response object.
   */
  ...[
    check('regionId').isInt(
      { min: 0, max: getDataTypeRange(Region, 'id').max },
    ).withMessage('Region ID must be a valid non-negative integer'),
    check('hierarchyId').optional().isInt(
      { min: 0, max: getDataTypeRange(Hierarchy, 'hierarchyId').max },
    ).withMessage('Hierarchy ID must be a valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getRegionById(req, res);
  },
);
router.get(
  '/:regionId/subregions',
  ...[
    check('regionId').isInt(
      { min: 0, max: getDataTypeRange(Region, 'id').max },
    ).withMessage('Region ID must be a valid non-negative integer'),
    query('getAll').optional().isBoolean().withMessage('getAll must be a boolean'),
    query('hierarchyId').optional().isInt(
      { min: 0, max: getDataTypeRange(Hierarchy, 'hierarchyId').max },
    ).withMessage('Hierarchy ID must be a valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getSubregions(req, res);
  },
);
router.get(
  '/:regionId/ancestors',
  ...[
    check('regionId').isInt(
      { min: 0, max: getDataTypeRange(Region, 'id').max },
    ).withMessage('Region ID must be a valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getAncestors(req, res);
  },
);

router.get(
  '/:regionId/geometry',
  ...[
    check('regionId').isInt(
      { min: 0, max: getDataTypeRange(Region, 'id').max },
    ).withMessage('Region ID must be a valid non-negative integer'),
    check('resolveEmpty').optional().isBoolean().withMessage('resolveEmpty must be a boolean'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getGeometry(req, res);
  },
);

router.get(
  '/:regionId/siblings',
  ...[
    check('regionId').isInt(
      { min: 0, max: getDataTypeRange(Region, 'id').max },
    ).withMessage('Region ID must be a valid non-negative integer'),
    check('hierarchyId').optional().isInt(
      { min: 0, max: getDataTypeRange(Hierarchy, 'hierarchyId').max },
    ).withMessage('Hierarchy ID must be a valid non-negative integer'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map((error) => error.msg);
      return res.status(400).json({ errors: errorMessages });
    }
    return regionController.getSiblings(req, res);
  },
);

module.exports = router;
