import React, { useState, useEffect } from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import { Box } from '@mui/material';
import {
  fetchRootRegions, fetchSiblings, fetchSubregions,
} from '../api';
import { useNavigation } from './NavigationContext';

/**
 * `ListOfRegions` is a component that displays a list of clickable regions.
 *
 * It makes use of the `NavigationContext` for managing the state and handles the selection
 * of regions based on user interaction. It fetches the root or subregions depending on
 * the selected region and hierarchy context. This component does not take parameters.
 *
 * @return {JSX.Element} A box containing the list of regions, with potential error messaging.
 */
function ListOfRegions() {
  const { selectedRegion, setSelectedRegion, selectedHierarchy } = useNavigation();
  const [regions, setRegions] = useState([]);
  const [error, setError] = useState(null);

  const fetchRegions = async (regionId, hasSubregions) => {
    let newRegions = [];
    try {
      if (regionId) {
        if (hasSubregions) {
          newRegions = await fetchSubregions(regionId, selectedHierarchy.hierarchyId);
        } else {
          newRegions = await fetchSiblings(regionId, selectedHierarchy.hierarchyId);
        }
      } else {
        newRegions = await fetchRootRegions(selectedHierarchy.hierarchyId);
      }

      if (newRegions.length > 0) {
        setRegions(newRegions);
      }
      setError(null);
    } catch (fetchError) {
      console.error('Error fetching regions: ', fetchError);
      setError('An error occurred while fetching regions.');
    }
  };

  useEffect(() => {
    fetchRegions(selectedRegion.id, selectedRegion.hasSubregions);
  }, [selectedRegion, selectedHierarchy]);

  const handleItemClick = (region) => {
    if (region.id === selectedRegion.id) {
      return;
    }
    setSelectedRegion(
      {
        id: region.id,
        name: region.name,
        info: selectedRegion.info,
        hasSubregions: region.hasSubregions,
      },
    );
  };

  return (
    <Box sx={{ height: '400px', overflow: 'auto' }}>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <List>
        {regions.map((region) => (
          <ListItem key={region.id} button onClick={() => handleItemClick(region)}>
            {region.name}
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

export default ListOfRegions;
