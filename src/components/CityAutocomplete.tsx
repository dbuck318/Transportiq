import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface Props {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

export default function CityAutocomplete({ name, value, onChange, onBlur, placeholder, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const placesLib = useMapsLibrary('places');
  const coreLib = useMapsLibrary('core');

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  // Initialize Autocomplete widget
  useEffect(() => {
    if (!inputRef.current || !placesLib || !coreLib) return;

    try {
      const options: google.maps.places.AutocompleteOptions = {
        types: ['(cities)'],
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address', 'name'],
      };

      const autocompleteInstance = new placesLib.Autocomplete(inputRef.current, options);
      setAutocomplete(autocompleteInstance);
      
      return () => {
        if (autocompleteInstance && coreLib) {
          coreLib.event.clearInstanceListeners(autocompleteInstance);
        }
      };
    } catch (error) {
      console.error("Maps API Initialization Error:", error);
    }
  }, [placesLib, coreLib]);

  // Handle Place Selection
  useEffect(() => {
    if (!autocomplete || !coreLib) return;

    let listener: google.maps.MapsEventListener | null = null;
    try {
      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place) return;

        let newValue = '';
        if (place.address_components) {
          const city = place.address_components.find((c: any) => c.types.includes('locality'))?.long_name;
          const state = place.address_components.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name;
          if (city && state) {
            newValue = `${city}, ${state}`;
          } else {
            newValue = place.formatted_address?.replace(', USA', '') || '';
          }
        } else if (place.name) {
          newValue = place.name;
        }

        if (newValue) {
          onChange(newValue);
          // Manually fire blur if the user selects from dropdown so it saves immediately
          if (onBlur) {
            setTimeout(() => onBlur(), 50);
          }
        }
      });
    } catch (err) {
      console.error("Maps Place Changed Error:", err);
    }

    return () => {
      if (listener && coreLib) {
        coreLib.event.removeListener(listener);
      }
    };
  }, [autocomplete, onChange, onBlur, coreLib]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleBlur = () => {
    if (onBlur) {
      // Delay slightly so that React state updates are flushed
      setTimeout(() => onBlur(), 150);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      name={name}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder || ''}
      className={className}
      autoComplete="off"
    />
  );
}
