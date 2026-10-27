import { z } from "zod";
import movementsJson from "../../../data/movements.json";
import contraindicationsJson from "../../../data/contraindications.json";
import taxonomyJson from "../../../data/stimulus-taxonomy.json";
import conversionsJson from "../../../data/conversions.json";
import type { DomainData } from "./library";
import { ContraindicationSchema, ConversionsSchema, MovementSchema, StimulusTaxonomySchema } from "./types";

const data: DomainData = {
  movements: z.array(MovementSchema).parse(movementsJson),
  contraindications: z.array(ContraindicationSchema).parse(contraindicationsJson),
  taxonomy: StimulusTaxonomySchema.parse(taxonomyJson),
  conversions: ConversionsSchema.parse(conversionsJson),
};

export function loadDomainDataFromFiles(): DomainData {
  return data;
}
