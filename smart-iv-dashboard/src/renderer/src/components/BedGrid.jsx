import React from 'react';
import BedCard from './BedCard';

function BedGrid({ beds }) {
  // 1. Convert the object to an array
  const bedList = Object.values(beds);

  // 2. Sort the list by bedId numerically (01, 02, 03...)
  // We use parseInt to ensure "10" comes after "09"
  const sortedBeds = bedList.sort((a, b) => {
    return parseInt(a.bedId) - parseInt(b.bedId);
  });

  const gridStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '25px',
    padding: '30px',
    justifyContent: 'center'
  };

  return (
    <div style={gridStyle}>
      {sortedBeds.length === 0 ? (
        <p style={{ fontSize: '18px', color: '#666' }}>Waiting for telemetry data from ESP32 Receiver...</p>
      ) : (
        // 3. Map over the sorted list instead of the raw list
        sortedBeds.map((bed) => (
          <BedCard key={bed.bedId} bed={bed} />
        ))
      )}
    </div>
  );
}

export default BedGrid;