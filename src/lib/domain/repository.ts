import { z } from "zod";
import movementsJson from "../../../data/movements.json";
import contraindicationsJson from "../../../data/contraindications.json";
import taxonomyJson from "../../../data/stimulus-taxonomy.json";
import conversionsJson from "../../../data/conversions.json";
import {
  ContraindicationSchema, ConversionsSchema, MovementSchema, StimulusTaxonomySchema,
  type Contraindication, type Conversions, type Movement, type StimulusTaxonomy,
} from "./types";

export interface DomainData {
  movements: Movement[];
  contraindications: Contraindication[];
  taxonomy: StimulusTaxonomy;
  conversions: Conversions;
}

const data: DomainData = {
  movements: z.array(MovementSchema).parse(movementsJson),
  contraindications: z.array(ContraindicationSchema).parse(contraindicationsJson),
  taxonomy: StimulusTaxonomySchema.parse(taxonomyJson),
  conversions: ConversionsSchema.parse(conversionsJson),
};

export async function getDomainData(): Promise<DomainData> {
  return data;
}
