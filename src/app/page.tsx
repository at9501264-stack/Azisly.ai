'use client';

import React from 'react';
import { useSession } from '@/context/SessionContext';
import { RoomSetup } from '@/components/setup/RoomSetup';
import { DiscussionRoom } from '@/components/room/DiscussionRoom';
import { SessionSummary } from '@/components/summary/SessionSummary';

export default function GDApp() {
  const { state } = useSession();

  switch (state.phase) {
    case 'setup':
      return <RoomSetup />;
    case 'completed':
      return <SessionSummary />;
    case 'opening':
    case 'discussion':
    case 'closing':
    default:
      return <DiscussionRoom />;
  }
}
