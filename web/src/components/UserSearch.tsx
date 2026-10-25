import React, { useState } from 'react';
import { Search, UserCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { CFUser } from '../types';

interface UserSearchProps {
  onSearch: (handle: string) => void;
  isLoading: boolean;
  currentUser: CFUser | null;
  isFallback: boolean;
  errorMessage: string | null;
}

export const UserSearch: React.FC<UserSearchProps> = ({
  onSearch,
  isLoading,
  currentUser,
  isFallback,
  errorMessage,
}) => {
  const [inputHandle, setInputHandle] = useState('');
  const demoHandles = ['tourist', 'Petr', 'Errichto', 'SecondThread'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputHandle.trim()) {
      onSearch(inputHandle.trim());
    }
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', position: 'relative' }}>
          <input
            type="text"
            value={inputHandle}
            onChange={(e) => setInputHandle(e.target.value)}
            placeholder="Enter Codeforces Handle (e.g. tourist, tourist_fan)..."
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              outline: 'none',
            }}
          />
          <Search
            size={18}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !inputHandle.trim()}
          style={{
            background: 'var(--accent-blue)',
            color: '#0f172a',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            opacity: isLoading || !inputHandle.trim() ? 0.6 : 1,
          }}
        >
          {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <UserCheck size={18} />}
          {isLoading ? 'Analyzing...' : 'Predict & Recommend'}
        </button>
      </form>

      {/* Demo Handle Quick-Select */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Offline Demo Users:</span>
        {demoHandles.map((handle) => (
          <button
            key={handle}
            type="button"
            onClick={() => {
              setInputHandle(handle);
              onSearch(handle);
            }}
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              padding: '0.2rem 0.6rem',
              borderRadius: '0.375rem',
              fontSize: '0.8rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
          >
            {handle}
          </button>
        ))}
      </div>

      {/* Alerts & Current User Status */}
      {errorMessage && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '0.5rem',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {currentUser && !errorMessage && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--bg-card-hover)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: 'var(--accent-blue)',
                border: '1px solid var(--accent-blue)',
              }}
            >
              {currentUser.handle[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {currentUser.handle}
                {isFallback && (
                  <span
                    className="badge badge-info"
                    style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}
                    title="Served from local offline snapshot"
                  >
                    Offline Snapshot
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Rating: <strong style={{ color: 'var(--accent-blue)' }}>{currentUser.rating ?? 1200}</strong> • Rank:{' '}
                <span style={{ textTransform: 'capitalize' }}>{currentUser.rank ?? 'Unrated'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
