const turf = require('@turf/turf');

const { QueryTypes } = require('sequelize');
const _ = require('lodash');
const {
  Region, Hierarchy, HierarchyNames,
} = require('../models');
const sequelize = require('../config/db');

/**
 * Searches for regions based on the input query and hierarchy.
 *
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {Object} - An array of regions found
 * @throws {Error} - If an error occurs during the search
 */
exports.searchRegions = async (req, res) => {
  try {
    const inputQuery = req.query.query; // "America York"
    const hierarchyId = req.query.hierarchyId || 1;

    // Split the input query into terms
    const queryTerms = inputQuery.split(' ').filter((term) => term.trim() !== '');
    // Escape the query terms to be used in the regex pattern
    const escapedQueryTerms = queryTerms.map((term) => _.escapeRegExp(term));

    // Construct the replacements object, to be used in the query
    const replacements = {
      hierarchyId,
      inputQuery,
    };
    replacements.regexPattern = escapedQueryTerms.join('\\s+'); // Regex pattern to match all terms in the region name
    escapedQueryTerms.forEach((term, index) => {
      replacements[`term${index}`] = `%${term}%`;
    });

    const nameMatchClausesList = [];
    const pathMatchClausesList = [];
    const regexMatchCaseStatements = [];
    const substringMatchCaseStatements = [];
    for (let i = 0; i < escapedQueryTerms.length; i += 1) {
      regexMatchCaseStatements.push(`CASE WHEN result.main_name ~* ( '(^|\\w)' || :term${i} || '(\\w|$)' ) THEN 100 ELSE 0 END`);
      substringMatchCaseStatements.push(`CASE WHEN result.main_name ILIKE '%' || :term${i} || '%' THEN ${i + 1} ELSE 0 END`);
      nameMatchClausesList.push(`region_name ILIKE :term${i}`);
      pathMatchClausesList.push(`result.path ILIKE :term${i}`);
    }
    const nameMatchClauses = nameMatchClausesList.join(' OR ');
    const pathMatchClauses = pathMatchClausesList.join(' AND ');

    const sqlQuery = `
      WITH RECURSIVE PathCTE AS (
        SELECT
          region_id,
          region_name,
          parent_id,
          hierarchy_id,
          CAST(region_name AS VARCHAR(255)) AS path,
          region_name AS main_name,
          region_id AS main_id
        FROM
          hierarchy
        WHERE
          hierarchy_id = :hierarchyId AND (${nameMatchClauses})
        UNION ALL
          SELECT
            parent.region_id,
            parent.region_name,
            parent.parent_id,
            parent.hierarchy_id,
            CAST(parent.region_name || ' > ' || child.path AS VARCHAR(255)) AS path,
            child.main_name AS main_name,
            child.main_id AS main_id
          FROM
            hierarchy parent
          JOIN PathCTE child ON parent.region_id = child.parent_id
          WHERE parent.hierarchy_id = :hierarchyId
        )
        SELECT
          result.main_id,
          result.main_name,
          result.path,
          (
            CASE WHEN result.path ILIKE '%> ' || :inputQuery || '%' THEN 400 ELSE 0 END
            +
            CASE WHEN result.main_name ILIKE '%' || :inputQuery || '%' THEN 300 ELSE 0 END
            +
            CASE WHEN result.main_name ~* :regexPattern THEN 200 ELSE 0 END
            +
            (${regexMatchCaseStatements.join(' + ')})
            +
            (${substringMatchCaseStatements.join(' + ')})
          ) AS relevance_score
        FROM
         PathCTE result
        WHERE
          ${pathMatchClauses}
        ORDER BY relevance_score DESC;
    `;

    const regions = await sequelize.query(sqlQuery, {
      replacements,
      type: QueryTypes.SELECT,
    });

    const uniqueRegions = new Map();
    regions.forEach((region) => {
      if (!uniqueRegions.has(region.main_id)
        || uniqueRegions.get(region.main_id).path.length < region.path.length) {
        uniqueRegions.set(region.main_id, region);
      }
    });

    const result = Array.from(uniqueRegions.values()).map((region) => ({
      id: region.main_id,
      name: region.main_name,
      path: region.path,
    }));

    if (result.length === 0) {
      return res.status(204).json({ message: 'No regions found' });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

async function getAllSubregions(regionId, hierarchyId) {
  const query = `
        WITH RECURSIVE Subregions AS (
            SELECT *
            FROM hierarchy
            WHERE parent_id = :regionId AND hierarchy_id = :hierarchyId
            UNION ALL
            SELECT h.*
            FROM hierarchy h
            INNER JOIN Subregions s ON h.parent_id = s.region_id AND h.hierarchy_id = :hierarchyId
        )
        SELECT * FROM Subregions;
    `;

  return sequelize.query(query, {
    replacements: { regionId, hierarchyId },
    type: QueryTypes.SELECT,
    mapToModel: true,
    model: Hierarchy,
  });
}

// Retrieve subregions for a specific region
async function getSubregions(regionId, hierarchyId, getAll) {
  try {
    // Check if the region exists
    const region = await Hierarchy.findOne({
      where: {
        regionId,
        hierarchyId,
      },
    });

    if (!region) {
      return { data: [], message: 'Region not found', status: 404 };
    }

    // Retrieve subregions
    let subregions;
    // Check the getAll query parameter
    if (getAll === 'true') {
      subregions = await getAllSubregions(regionId, hierarchyId);
    } else {
      subregions = await Hierarchy.findAll({
        where: { parentId: regionId, hierarchyId },
        mapToModel: true,
        model: Hierarchy,
      });
    }

    if (subregions.length === 0) {
      return { data: [], message: 'Region has no subregions', status: 202 };
    }

    return { data: subregions, status: 200 };
  } catch (err) {
    console.error(err);
    return { data: [], message: 'Internal Server Error', status: 500 };
  }
}

// Retrieve the divisions of a region. It does not include subdivisions of the divisions.
async function getDivisions(regionId, hierarchyId) {
  const regions = (await getSubregions(regionId, hierarchyId, false)).data;
  // Add the region itself
  regions.push(await Hierarchy.findOne({
    where: {
      regionId,
      hierarchyId,
    },
  }));
  let resultDivisions = [];
  const promises = regions.map(async (region) => {
    const query = `
            SELECT r.* FROM hierarchy_region_mapping hrm
            JOIN regions r ON hrm.region_id = r.id
            WHERE alt_region_id = :regionId AND hierarchy_id = :hierarchyId
            `;
    return sequelize.query(query, {
      replacements: { regionId: region.regionId, hierarchyId },
      type: QueryTypes.SELECT,
      mapToModel: true,
      model: Region,
    });
  });
  const results = await Promise.all(promises);
  results.forEach((result) => {
    resultDivisions = resultDivisions.concat(result.map((r) => r.dataValues));
  });
  return resultDivisions;
}

exports.getHierarchies = async (req, res) => {
  try {
    const hierarchies = await HierarchyNames.findAll();
    res.status(200).json(hierarchies.map((hierarchy) => hierarchy.toApiFormat()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getGeometry = async (req, res) => {
  const { regionId } = req.params;
  const resolveEmpty = req.query.resolveEmpty === 'true';
  const hierarchyId = req.query.hierarchyId || 1;

  // Check if the region exists
  const region = await Hierarchy.findOne({
    where: {
      regionId,
      hierarchyId,
    },
  });
  if (!region) {
    return res.status(404).json({ message: 'Region not found' });
  }

  // Find all subdivisions of the region
  const divisions = await getDivisions(regionId, hierarchyId, res);
  let geometries = [];
  const promises = divisions.map(async (division) => {
    const divisionId = division.id;
    const { geom } = division;
    if (geom) {
      geometries.push(geom);
    } else if (!resolveEmpty) {
      return false;
    } else {
      // Find ids and geometries of all subdivisions of the division
      const query = `
                    WITH RECURSIVE Subregions AS (
                        SELECT r.id as region_id, ST_Simplify(r.geom, 0.0) as simplified_geom
                        FROM regions r
                        WHERE r.parent_region_id = :divisionId
                        UNION ALL
                        SELECT r_r.id, ST_Simplify(r_r.geom, 0.0) as simplified_geom_r
                        FROM regions r_r
                        INNER JOIN Subregions s ON r_r.parent_region_id = s.region_id
                        WHERE s.simplified_geom IS NULL)
                    SELECT ST_Multi(ST_Union(simplified_geom)) as geometry
                    FROM Subregions
                    WHERE simplified_geom IS NOT NULL;
                `;
      const result = await sequelize.query(query, {
        replacements: { divisionId },
        type: QueryTypes.SELECT,
      });
      const resultGeometry = result[0].geometry;
      // Update the geometry of the region
      if (resultGeometry) {
        geometries.push(resultGeometry);
        // Asynchronously update the geometry of the region
        Region.update({ geom: resultGeometry }, {
          where: { id: divisionId },
        }).then().catch((err) => console.log(err));
      }
    }
    return true;
  });

  const results = await Promise.all(promises);
  const allHasGeometry = results.every((r) => r !== false);

  geometries = geometries.filter((g) => g != null);

  if (geometries.length === 0) {
    return res.status(204).json({ message: 'No geometries found' });
  }

  if (!allHasGeometry) {
    return res.status(204).json({ message: 'Not all geometries are available' });
  }

  // Combine all geometries into a single MultiPolygon
  let combinedGeometry = geometries[0];
  if (geometries.length === 1) {
    // If there is only one geometry, return it converted to a MultiPolygon
    combinedGeometry = turf.multiPolygon(combinedGeometry.coordinates);
  }
  if (geometries.length > 1) {
    // If there are multiple geometries, combine them into a single MultiPolygon
    for (let i = 0; i < geometries.length; i += 1) {
      combinedGeometry = turf.union(combinedGeometry, geometries[i]);
    }
  }
  let result;
  // Check the type of the combined geometry
  if (combinedGeometry.geometry.type !== 'MultiPolygon') {
    result = turf.multiPolygon([combinedGeometry.geometry.coordinates]);
  } else {
    result = turf.multiPolygon(combinedGeometry.geometry.coordinates);
  }

  return res.status(200).json(result);
};

exports.getAncestors = async (req, res) => {
  const { regionId } = req.params;
  const hierarchyId = req.query.hierarchyId || 1;

  // Check if the region exists
  const region = await Hierarchy.findOne({
    where: {
      regionId,
      hierarchyId,
    },
  });
  if (!region) {
    return res.status(404).json({ message: 'Region not found' });
  }

  try {
    const ancestors = await Hierarchy.getAncestors(regionId, hierarchyId);
    return res.status(200).json(ancestors);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getRootRegions = async (req, res) => {
  try {
    const hierarchyId = req.query.hierarchyId || 1;

    const hierarchyRegions = await Hierarchy.findAll({
      where: {
        parentId: null,
        hierarchyId,
      },
    });
    res.status(200).json(hierarchyRegions.map((region) => region.toApiFormat()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getRegionById = async (req, res) => {
  try {
    const { regionId } = req.params;
    const hierarchyId = req.query.hierarchyId || 1;

    const region = await Hierarchy.findOne({
      where: {
        regionId,
        hierarchyId,
      },
    });

    if (!region) {
      return res.status(404).json({ message: 'Region not found' });
    }

    return res.status(200).json(region.toApiFormat());
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.getSubregions = async (req, res) => {
  const { regionId } = req.params;
  const getAll = req.query.getAll || false;
  const hierarchyId = req.query.hierarchyId || 1;

  const subregions = await getSubregions(regionId, hierarchyId, getAll);
  const result = subregions.data ? subregions.data.map(
    (r) => r.toApiFormat(),
  ) : { message: subregions.message };
  return res.status(subregions.status).json(result);
};

exports.getSiblings = async (req, res) => {
  const { regionId } = req.params;
  const hierarchyId = req.query.hierarchyId || 1;

  console.log('regionId: ', regionId);

  // Check if the region exists
  const region = await Hierarchy.findOne({
    where: {
      regionId,
      hierarchyId,
    },
  });
  if (!region) {
    return res.status(404).json({ message: 'Region not found' });
  }

  try {
    const siblings = await region.getSiblings();
    return res.status(200).json(siblings.map((sibling) => sibling.toApiFormat()));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};
