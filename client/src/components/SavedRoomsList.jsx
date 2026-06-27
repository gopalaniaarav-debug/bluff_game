import { useEffect, useState } from 'react';
import { getServerUrl } from '../socket';

export default function SavedRoomsList({
  playerName,
  connected,
  onJoinRoom,
  refreshKey = 0,
}) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  const loadRooms = () => {
    setLoading(true);
    fetch(`${getServerUrl()}/api/rooms`)
      .then((r) => r.json())
      .then((data) => setRooms(data.rooms ?? []))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRooms();
  }, [refreshKey]);

  const handleDelete = async (code) => {
    if (!window.confirm(`Delete room ${code} and all its scores?`)) return;
    setError('');
    const res = await fetch(`${getServerUrl()}/api/rooms/${code}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not delete room');
      return;
    }
    loadRooms();
  };

  const startEdit = (code) => {
    setEditingCode(code);
    setEditValue(code);
    setError('');
  };

  const saveEdit = async () => {
    const next = editValue.trim().toUpperCase();
    if (next.length !== 4) {
      setError('Code must be 4 characters');
      return;
    }
    setError('');
    const res = await fetch(`${getServerUrl()}/api/rooms/${editingCode}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newCode: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not rename room');
      return;
    }
    setEditingCode(null);
    loadRooms();
  };

  if (loading && rooms.length === 0) {
    return (
      <div className="saved-rooms">
        <div className="saved-rooms__title">Your rooms</div>
        <p className="saved-rooms__empty">Loading rooms…</p>
      </div>
    );
  }

  return (
    <div className="saved-rooms">
      <div className="saved-rooms__title">Your rooms</div>
      <p className="saved-rooms__sub">Rejoin a saved table — each room keeps its own score history.</p>

      {error && <p className="error-msg">{error}</p>}

      {rooms.length === 0 ? (
        <p className="saved-rooms__empty">No saved rooms yet — create one above to start a persistent table.</p>
      ) : (
        <ul className="saved-rooms__list">
          {rooms.map((room) => (
          <li key={room.code} className="saved-rooms__item">
            {editingCode === room.code ? (
              <div className="saved-rooms__edit">
                <input
                  className="field-input field-input--code saved-rooms__edit-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value.toUpperCase().slice(0, 4))}
                  maxLength={4}
                />
                <button type="button" className="btn btn-gold btn-sm" onClick={saveEdit}>
                  Save
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingCode(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="saved-rooms__info">
                  <span className="saved-rooms__code">{room.code}</span>
                  <span className="saved-rooms__meta">
                    Host {room.hostName} · {room.gameCount} game{room.gameCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="saved-rooms__actions">
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    disabled={!playerName.trim() || !connected}
                    onClick={() => onJoinRoom(room.code)}
                  >
                    Join
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(room.code)}>
                    Edit code
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(room.code)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        </ul>
      )}
    </div>
  );
}
