'use client';

import { Train } from '@/types';
import { TrainInfoCard } from './TrainInfoCard';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface TrainInfoModalProps {
  train: Train | null;
  onClose: () => void;
}

export function TrainInfoModal({ train, onClose }: TrainInfoModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (train) {
      setIsVisible(true);
      // Prevent body scroll on mobile when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      setIsVisible(false);
      // Restore body scroll
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [train]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Allow animation to complete
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startY = touch.clientY;
    const element = e.currentTarget as HTMLElement;
    
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const moveTouch = moveEvent.touches[0];
      const deltaY = moveTouch.clientY - startY;
      
      // Only allow swipe down to close
      if (deltaY > 0) {
        const progress = Math.min(deltaY / 200, 1);
        element.style.transform = `translateY(${deltaY}px)`;
        element.style.opacity = String(1 - progress * 0.5);
      }
    };

    const handleTouchEnd = (endEvent: TouchEvent) => {
      const endTouch = endEvent.changedTouches[0];
      const deltaY = endTouch.clientY - startY;
      
      // If swipe down more than 100px, close modal
      if (deltaY > 100) {
        handleClose();
      } else {
        // Snap back to original position
        element.style.transform = '';
        element.style.opacity = '';
      }
      
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };

    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
  };

  if (!isMounted || !train) return null;

  const modalContent = (
    <div 
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        // Ensure full viewport coverage on mobile
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        margin: 0,
        padding: 0
      }}
    >
      {/* Desktop backdrop */}
      <div 
        className="hidden md:block absolute inset-0 bg-black bg-opacity-50"
        onClick={handleBackdropClick}
      />
      
      {/* Mobile backdrop */}
      <div 
        className="md:hidden absolute inset-0 bg-black bg-opacity-30"
        onClick={handleBackdropClick}
        style={{ margin: 0, padding: 0 }}
      />
      
      {/* Modal container */}
      <div 
        className="flex items-end md:items-center justify-start md:justify-end h-full w-full"
        style={{ 
          margin: 0, 
          padding: '0',
          // On desktop add padding
          ...(typeof window !== 'undefined' && window.innerWidth >= 768 ? { padding: '1rem' } : {})
        }}
      >
        {/* Mobile: Bottom sheet */}
        <div 
          className={`md:hidden w-full transition-transform duration-300 ${
            isVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{
            height: '100vh',
            maxHeight: '100vh',
            margin: 0,
            padding: 0
          }}
          onTouchStart={handleTouchStart}
        >
          <TrainInfoCard train={train} onClose={handleClose} />
        </div>
        
        {/* Desktop: Side modal */}
        <div 
          className={`hidden md:block transition-all duration-300 ${
            isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
        >
          <TrainInfoCard train={train} onClose={handleClose} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}