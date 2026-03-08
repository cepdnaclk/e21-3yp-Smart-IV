import React from 'react';
import BedCard from './BedCard';

/**
 * BedGrid Component
 * Receives the entire dictionary of bed states and maps them into a responsive grid.
 */
function BedGrid({ beds }) {
  // Convert the beds object (sent from IPC) into an array so we can map over it
  const bedList = Object.values(beds);

  const gridStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    padding: '20px'
  };

  return (
    <div style={gridStyle}>
      {/* If there are no beds connected yet, show a waiting message */}
      {bedList.length === 0 ? (
        <p>Waiting for telemetry data from ESP32 Receiver...</p>
      ) : (
        /* Iterate through our bed array and create a BedCard for each one */
        bedList.map((bed) => (
          <BedCard key={bed.bedId} bed={bed} />
        ))
      )}
    </div>
  );
}

export default BedGrid;