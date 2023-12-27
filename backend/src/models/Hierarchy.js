const { Model, DataTypes, QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

class Hierarchy extends Model {
  // Transform the returned object to API format
  toApiFormat() {
    return {
      id: this.regionId,
      name: this.regionName,
      hasSubregions: this.hasSubregions,
    };
  }

  async getSiblings() {
    return Hierarchy.findAll({
      where: {
        parentId: this.parentId,
        hierarchyId: this.hierarchyId,
      },
    });
  }

  static async getAncestors(regionId, hierarchyId) {
    const ancestors = await sequelize.query(`
            WITH RECURSIVE Ancestors AS (
                SELECT region_id, parent_id as parentRegionId, region_name
                FROM hierarchy
                WHERE region_id = :regionId AND hierarchy_id = :hierarchyId
                UNION ALL
                SELECT h.region_id, h.parent_id as parentRegionId, h.region_name
                FROM hierarchy h
                INNER JOIN Ancestors a ON h.region_id = a.parentRegionId
            )
            SELECT * FROM Ancestors;
        `, {
      replacements: { regionId, hierarchyId },
      type: QueryTypes.SELECT,
    });
    return ancestors.map((ancestor) => ({
      id: ancestor.region_id, name: ancestor.region_name, parentRegionId: ancestor.parentRegionId,
    }));
  }
}

Hierarchy.init({
  regionId: {
    type: DataTypes.INTEGER,
    field: 'region_id',
    primaryKey: true,
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'parent_id',
  },
  hierarchyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'hierarchy_id',
    primaryKey: true,
  },
  regionName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'region_name',
  },
  hasSubregions: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    field: 'has_subregions',
  },
}, {
  sequelize,
  modelName: 'Hierarchy',
  tableName: 'hierarchy',
  timestamps: false,
});

module.exports = Hierarchy;
