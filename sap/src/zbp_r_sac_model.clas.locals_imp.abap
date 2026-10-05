CLASS lhc_model DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR model RESULT result.

    METHODS checkstructure FOR VALIDATE ON SAVE
      IMPORTING keys FOR model~CheckStructure.
ENDCLASS.

CLASS lhc_model IMPLEMENTATION.

  METHOD get_global_authorizations.
  ENDMETHOD.


  " at most five dimensions (the fact table has five slots), slots 1..5 and unique, at least one measure
  METHOD checkstructure.
    READ ENTITIES OF zr_sac_model IN LOCAL MODE
      ENTITY model
        FIELDS ( ModelName ) WITH CORRESPONDING #( keys )
        RESULT DATA(models)
      ENTITY model BY \_Dimension
        FIELDS ( Slot ) WITH CORRESPONDING #( keys )
        RESULT DATA(dimensions)
      ENTITY model BY \_Measure
        FIELDS ( MeasureId ) WITH CORRESPONDING #( keys )
        RESULT DATA(measures).

    LOOP AT models INTO DATA(model).
      DATA(own_dims) = VALUE string_table( ).
      DATA(problem) = ``.
      DATA(count) = 0.
      LOOP AT dimensions INTO DATA(dim) WHERE ModelId = model-ModelId.
        count = count + 1.
        IF dim-Slot < 1 OR dim-Slot > 5.
          problem = |Dimension { dim-DimId }: slot must be 1 to 5|.
        ELSEIF line_exists( own_dims[ table_line = |{ dim-Slot }| ] ).
          problem = |Slot { dim-Slot } is used twice|.
        ENDIF.
        APPEND |{ dim-Slot }| TO own_dims.
      ENDLOOP.
      IF count = 0 AND problem IS INITIAL.
        problem = `A model needs at least one dimension`.
      ENDIF.
      IF problem IS INITIAL AND NOT line_exists( measures[ ModelId = model-ModelId ] ).
        problem = `A model needs at least one measure`.
      ENDIF.
      IF problem IS NOT INITIAL.
        APPEND VALUE #( %tky = model-%tky ) TO failed-model.
        APPEND VALUE #( %tky = model-%tky
                        %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error text = problem ) )
          TO reported-model.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
