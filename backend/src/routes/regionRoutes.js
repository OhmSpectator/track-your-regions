const express = require('express');
const { check, query, validationResult } = require('express-validator');
const regionController = require('../controllers/regionController');

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
    check('hierarchyId').optional().isInt().withMessage('Hierarchy ID must be an integer'),
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
  [
    query('query').isString().withMessage('Query must be a string'),
    query('hierarchyId').optional().isInt().withMessage('Hierarchy ID must be an integer'),
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
  ...[
    check('regionId').isInt().withMessage('Region ID must be an integer'),
    check('hierarchyId').optional().isInt().withMessage('Hierarchy ID must be an integer'),
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
    check('regionId').isInt().withMessage('Region ID must be an integer'),
    query('getAll').optional().isBoolean().withMessage('getAll must be a boolean'),
    query('hierarchyId').optional().isInt().withMessage('Hierarchy ID must be an integer'),
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
    check('regionId').isInt().withMessage('Region ID must be an integer'),
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
    check('regionId').isInt().withMessage('Region ID must be an integer'),
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
    check('regionId').isInt().withMessage('Region ID must be an integer'),
    check('hierarchyId').optional().isInt().withMessage('Hierarchy ID must be an integer'),
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
