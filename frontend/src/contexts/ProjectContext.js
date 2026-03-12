import { createContext, useContext } from "react";

const ProjectContext = createContext(null);

export function useProjectContext() {
  return useContext(ProjectContext);
}

export default ProjectContext;
