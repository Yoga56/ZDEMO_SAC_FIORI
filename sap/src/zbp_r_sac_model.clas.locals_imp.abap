CLASS lhc_model DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR model RESULT result.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR model~SetOwner.

    METHODS checkstructure FOR VALIDATE ON SAVE
      IMPORTING keys FOR model~CheckStructure.
ENDCLASS.

CLASS lhc_model IMPLEMENTATION.

  " the owner changes and deletes; whoever the model was shared with for editing changes it; the others can only read it
  METHOD get_instance_authorizations.
    DATA may_edit   TYPE if_abap_behv=>t_authorization.
    DATA may_delete TYPE if_abap_behv=>t_authorization.
    LOOP AT keys INTO DATA(key).
      may_edit   = COND #( WHEN zcl_sac_access=>can_edit( kind = 'MODEL' id = CONV #( key-ModelId ) ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      may_delete = COND #( WHEN zcl_sac_access=>can_delete( kind = 'MODEL' id = CONV #( key-ModelId ) ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky              = key-%tky
                      %update           = may_edit
                      %delete           = may_delete
                      %assoc-_Dimension = may_edit
                      %assoc-_Measure   = may_edit ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " a new model belongs to the user who creates it
  METHOD setowner.
    READ ENTITIES OF zr_sac_model IN LOCAL MODE
      ENTITY model
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(models).
    DELETE models WHERE OwnerId IS NOT INITIAL.
    CHECK models IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_model IN LOCAL MODE
      ENTITY model
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR m IN models ( %tky = m-%tky OwnerId = zcl_sac_access=>user( ) ) ).
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
