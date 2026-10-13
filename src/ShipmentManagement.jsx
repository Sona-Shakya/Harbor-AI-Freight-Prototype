import React from 'react';
import BookingManagement from './BookingManagement';

export default function ShipmentManagement(props) {
  return <BookingManagement {...props} isShipmentView={true} />;
}

