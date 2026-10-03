import { ref } from "vue";

// One open helper at a time, including repeated settings on different pages.
export const activeHelpUid = ref(null);
