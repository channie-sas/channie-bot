// src/database/eventTypes.js
const EVENT_TYPES = {
    NONE: 0,
    COUNTING_GAME: 1,
    WEREWOLF_GAME: 2 
  };
  
  const EVENT_NAMES = {
    [EVENT_TYPES.NONE]: "None",
    [EVENT_TYPES.COUNTING_GAME]: "Counting Game",
    [EVENT_TYPES.WEREWOLF_GAME]: "One Night Werewolf"
  };
  
  module.exports = {
    EVENT_TYPES,
    EVENT_NAMES
  };